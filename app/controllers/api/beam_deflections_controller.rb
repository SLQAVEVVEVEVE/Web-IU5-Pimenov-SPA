module Api
  class BeamDeflectionsController < BaseController
    before_action :require_auth!
    before_action :set_beam_deflection, only: [:show, :update, :form, :complete, :reject, :destroy]
    before_action :authorize_view!, only: [:show]
    before_action :check_owner, only: [:update, :form, :destroy]
    before_action :require_moderator!, only: [:complete, :reject]

    # GET /api/beam_deflections
    # List all non-deleted beam_deflections
    # - Moderators see ALL non-deleted (including draft)
    # - Regular users see only their own non-draft
    def index
      scope = BeamDeflection.not_deleted.includes(:creator, :moderator, :beam_deflection_beams)

      if Current.user&.moderator?
        # Moderators see all non-deleted beam_deflections (including draft)
      else
        # Regular users see only their own non-draft beam_deflections
        scope = scope.where(creator_id: Current.user.id).not_draft
      end

      statuses = Array(params[:status]).presence
      scope = scope.by_statuses(statuses) if statuses

      from = params[:from]
      to   = params[:to]
      if from.present?
        scope = scope.where('formed_at >= ?', from)
      end
      if to.present?
        scope = scope.where('formed_at <= ?', to)
      end

      scope = scope.order(formed_at: :desc)

      # simple pagination (optional)
      page = [params[:page].to_i, 1].max
      per  = params[:per_page].to_i
      per  = 20 if per.zero? || per < 0
      per  = [per, 100].min
      beam_deflections = scope.page(page).per(per)

      data = beam_deflections.map do |bd|
        {
          id: bd.id,
          status: bd.status,
          formed_at: bd.formed_at,
          completed_at: bd.completed_at,
          note: bd.note,
          creator_login: bd.creator&.email,
          moderator_login: bd.moderator&.email,
          items_with_result_count: bd.result_deflection_mm.present? ? nil : bd.beam_deflection_beams.where.not(deflection_mm: nil).count,
          result_deflection_mm: bd.result_deflection_mm
        }
      end

      render json: {
        beam_deflections: data,
        meta: {
          current_page: beam_deflections.current_page,
          next_page:    beam_deflections.next_page,
          prev_page:    beam_deflections.prev_page,
          total_pages:  beam_deflections.total_pages,
          total_count:  beam_deflections.total_count
        }
      }
    end

    # GET /api/requests/:id
    def show
      render json: serialize_beam_deflection(@beam_deflection)
    end

    # PUT /api/requests/:id
    # Only topic fields; allow on draft (and formed if needed by LR3)
    def update
      allowed = @beam_deflection.draft? || @beam_deflection.formed?
      return render_error('Not authorized', :forbidden) unless allowed && @beam_deflection.creator == Current.user

      if @beam_deflection.update(beam_deflection_params)
        render json: serialize_beam_deflection(@beam_deflection)
      else
        render_error(@beam_deflection.errors.full_messages, :unprocessable_entity)
      end
    end

    # PUT /api/requests/:id/form
    def form
      # Ensure draft ownership for LR3
      return render_error('Request must be in draft status', :unprocessable_entity) unless @beam_deflection.draft?
      return render_error('Not authorized', :forbidden) unless @beam_deflection.creator == Current.user

      items = @beam_deflection.beam_deflection_beams
      return render_error('Empty cart', :unprocessable_entity) unless items.exists?

      missing = items.where(length_m: nil).or(items.where(udl_kn_m: nil)).exists?
      return render_error('Required fields missing', :unprocessable_entity) if missing

      @beam_deflection.update!(status: BeamDeflection::STATUSES[:formed], formed_at: Time.current)
      render json: serialize_beam_deflection(@beam_deflection)
    rescue => e
      render_error(@beam_deflection.errors.full_messages.presence || e.message, :unprocessable_entity)
    end

    # PUT /api/requests/:id/complete
    def complete
      unless @beam_deflection.formed?
        return render_error('Request must be in formed status', :unprocessable_entity)
      end

      # compute results per LR rules
      result = @beam_deflection.compute_result!

      @beam_deflection.update!(
        status: BeamDeflection::STATUSES[:completed],
        moderator: Current.user,
        completed_at: Time.current,
        result_deflection_mm: result[:total_deflection_mm],
        within_norm: result[:within_norm]
      )
      render json: serialize_beam_deflection(@beam_deflection)
    rescue => e
      render_error(@beam_deflection.errors.full_messages.presence || e.message, :unprocessable_entity)
    end

    # PUT /api/requests/:id/reject
    def reject
      unless Current.user&.moderator?
        return render_error('Moderator access required', :forbidden)
      end
      unless @beam_deflection.formed?
        return render_error('Request must be in formed status', :unprocessable_entity)
      end

      @beam_deflection.update!(
        status: BeamDeflection::STATUSES[:rejected],
        moderator: Current.user,
        completed_at: Time.current
      )
      render json: serialize_beam_deflection(@beam_deflection)
    rescue => e
      render_error(@beam_deflection.errors.full_messages.presence || e.message, :unprocessable_entity)
    end

    # DELETE /api/requests/:id
    def destroy
      return render_error('Not authorized', :forbidden) unless @beam_deflection.creator == Current.user
      @beam_deflection.update!(status: BeamDeflection::STATUSES[:deleted], completed_at: Time.current)
      head :no_content
    rescue => e
      render_error(@beam_deflection.errors.full_messages.presence || e.message, :unprocessable_entity)
    end

    private

    def set_beam_deflection
      @beam_deflection = BeamDeflection.not_deleted.find(params[:id])
    rescue ActiveRecord::RecordNotFound
      render_error('BeamDeflection not found', :not_found)
    end

    def beam_deflection_params
      params.require(:beam_deflection).permit(:note)
    end

    def check_owner
      return if @beam_deflection.creator == Current.user

      render_error('Not authorized', :forbidden)
    end

    def authorize_view!
      return if Current.user&.moderator? || @beam_deflection.creator == Current.user

      render_error('Not authorized', :forbidden)
    end

    def serialize_beam_deflection(bd)
      items = bd.beam_deflection_beams.includes(:beam).map do |bdb|
        beam = bdb.beam
        {
          beam_id: bdb.beam_id,
          beam_name: beam&.name,
          beam_material: beam&.material,
          beam_image_url: beam&.respond_to?(:image_url) ? beam&.image_url : beam&.try(:image_key),
          quantity: bdb.quantity,
          length_m: bdb.length_m,
          udl_kn_m: bdb.udl_kn_m,
          position: bdb.position,
          deflection_mm: bdb.deflection_mm
        }
      end

      {
        id: bd.id,
        status: bd.status,
        deflection_mm: bd.deflection_mm,
        within_norm: bd.within_norm,
        note: bd.note,
        formed_at: bd.formed_at,
        completed_at: bd.completed_at,
        creator_login: bd.creator&.email,
        moderator_login: bd.moderator&.email,
        items: items,
        result_deflection_mm: bd.result_deflection_mm
      }
    end
  end
end
