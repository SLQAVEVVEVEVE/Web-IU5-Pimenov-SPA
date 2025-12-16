import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { materialLabel } from '../services/api'
import { selectAuthUser, selectIsAuthenticated } from '../store/authSlice'
import {
  fetchDraftBadgeAsync,
  formDraftAsync,
  loadDraftAsync,
  removeDraftItemAsync,
  selectCurrentBeamDeflection,
  selectDraftError,
  selectDraftLoading,
  selectDraftUpdatingItemIds,
  updateDraftFieldsAsync,
  updateDraftItemAsync,
} from '../store/draftSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'

const FALLBACK_IMG = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='140' viewBox='0 0 200 140'><rect width='200' height='140' fill='%23e9ecef'/><rect x='35' y='25' width='130' height='90' fill='none' stroke='%23c0c4c9' stroke-width='3' stroke-dasharray='6 6'/><text x='100' y='75' text-anchor='middle' fill='%237a828c' font-family='Arial, sans-serif' font-size='12'>Нет изображения</text></svg>`

const MINIO_PUBLIC = (import.meta.env.VITE_MINIO_PUBLIC || 'http://localhost:9000/beam-deflection/').replace(/\/?$/, '/')

function displayItemImage(raw?: string | null) {
  if (!raw) return FALLBACK_IMG
  if (/^https?:\/\//i.test(raw)) return raw
  return `${MINIO_PUBLIC}${raw.replace(/^\//, '')}`
}

export function RequestPage() {
  const { id } = useParams()
  const requestId = Number(id)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const isAuthed = useAppSelector(selectIsAuthenticated)
  const user = useAppSelector(selectAuthUser)
  const loading = useAppSelector(selectDraftLoading)
  const error = useAppSelector(selectDraftError)
  const request = useAppSelector(selectCurrentBeamDeflection)
  const updatingItemIds = useAppSelector(selectDraftUpdatingItemIds)

  const [lengthsM, setLengthsM] = useState<Record<number, string>>({})
  const [udlKnM, setUdlKnM] = useState<Record<number, string>>({})
  const [note, setNote] = useState<string>('')
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthed) return
    if (!Number.isFinite(requestId) || requestId <= 0) return
    dispatch(loadDraftAsync(requestId))
  }, [dispatch, isAuthed, requestId])

  useEffect(() => {
    if (!request || request.id !== requestId) return
    setNote(request.note ?? '')
    setQuantities(
      Object.fromEntries(request.items.map((item) => [item.beam_id, String(item.quantity ?? 1)])) as Record<number, string>,
    )
    setLengthsM(
      Object.fromEntries(
        request.items.map((item) => [item.beam_id, item.length_m != null ? String(item.length_m) : '']),
      ) as Record<number, string>,
    )
    setUdlKnM(
      Object.fromEntries(
        request.items.map((item) => [item.beam_id, item.udl_kn_m != null ? String(item.udl_kn_m) : '']),
      ) as Record<number, string>,
    )
  }, [request, requestId])

  const isDraft = request?.status === 'draft'
  const canEdit = Boolean(isDraft)

  const canForm =
    isDraft &&
    Boolean(request?.items?.length) &&
    request.items.every((item) => {
      const length = Number(lengthsM[item.beam_id] ?? '')
      const udl = Number(udlKnM[item.beam_id] ?? '')
      return Number.isFinite(length) && length > 0 && Number.isFinite(udl) && udl >= 0
    })

  if (!isAuthed) return <Navigate to="/login" replace />

  if (!Number.isFinite(requestId) || requestId <= 0) {
    return (
      <div className="page-container">
        <Alert variant="danger">Некорректный id заявки</Alert>
      </div>
    )
  }

  const saveNote = async () => {
    setLocalError(null)
    await dispatch(updateDraftFieldsAsync({ id: requestId, note })).unwrap()
    return true
  }

  const saveItemFields = async (beamId: number) => {
    if (!canEdit) return true
    setLocalError(null)

    const lengthRaw = lengthsM[beamId] ?? ''
    const udlRaw = udlKnM[beamId] ?? ''

    const nextLength = lengthRaw === '' ? null : Number(lengthRaw)
    const nextUdl = udlRaw === '' ? null : Number(udlRaw)

    if (nextLength == null || !Number.isFinite(nextLength) || nextLength <= 0) {
      setLocalError('Длина должна быть положительным числом для каждой услуги')
      return false
    }

    if (nextUdl == null || !Number.isFinite(nextUdl) || nextUdl < 0) {
      setLocalError('Нагрузка должна быть числом >= 0 для каждой услуги')
      return false
    }

    await dispatch(updateDraftItemAsync({ draftId: requestId, beamId, length_m: nextLength, udl_kn_m: nextUdl })).unwrap()
    await dispatch(loadDraftAsync(requestId))
    return true
  }

  const saveAll = async () => {
    if (!request) return false
    for (const item of request.items) {
      const ok = await saveItemFields(item.beam_id)
      if (!ok) return false
    }
    await saveNote()
    return true
  }

  const onUpdateQuantity = async (beamId: number) => {
    if (!request || !isDraft) return
    const rawValue = quantities[beamId]
    const nextQty = Number(rawValue)
    const current = request.items.find((i) => i.beam_id === beamId)
    if (!current) return

    if (!Number.isFinite(nextQty) || nextQty < 1) {
      setQuantities((prev) => ({ ...prev, [beamId]: String(current.quantity) }))
      return
    }

    if (nextQty === current.quantity) return

    await dispatch(updateDraftItemAsync({ draftId: requestId, beamId, quantity: nextQty })).unwrap()
    await dispatch(loadDraftAsync(requestId))
    await dispatch(fetchDraftBadgeAsync())
  }

  const onRemoveItem = async (beamId: number) => {
    if (!isDraft) return
    await dispatch(removeDraftItemAsync({ draftId: requestId, beamId })).unwrap()
    await dispatch(loadDraftAsync(requestId))
    await dispatch(fetchDraftBadgeAsync())
  }

  const onForm = async () => {
    const ok = await saveAll()
    if (!ok) return
    await dispatch(formDraftAsync(requestId)).unwrap()
    navigate('/requests', { replace: true })
  }

  return (
    <div className="page-container">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Заявка #{requestId}</h2>
        <Link className="btn btn-outline-secondary" to="/requests">
          К списку заявок
        </Link>
      </div>

      {(error || localError) && <Alert variant="danger">{localError ?? error}</Alert>}

      {!request || request.id !== requestId ? (
        <div className="text-center py-4">
          <Spinner animation="border" role="status" />
        </div>
      ) : (
        <Card>
          <Card.Body>
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div>
                <div className="text-muted">Статус</div>
                <div className="fw-semibold">{request.status}</div>
              </div>
              {isDraft && (
                <Button variant="success" onClick={onForm} disabled={!canForm || loading}>
                  {loading ? <Spinner size="sm" animation="border" /> : 'Подтвердить заявку'}
                </Button>
              )}
            </div>

            <hr />

            <h5 className="mb-3">Услуги в заявке</h5>

            {request.items.length === 0 ? (
              <Alert variant="info">В заявке пока нет услуг.</Alert>
            ) : (
              <div className="request-items">
                {request.items.map((item) => {
                  const isUpdating = updatingItemIds.includes(item.beam_id)
                  const title = item.beam_name ?? `#${item.beam_id}`
                  const src = displayItemImage(item.beam_image_url)

                  return (
                    <div key={item.beam_id} className="request-item-card">
                      <div className="request-item-thumb">
                        <img
                          src={src}
                          alt={title}
                          onError={(e) => {
                            if (e.currentTarget.src !== FALLBACK_IMG) {
                              e.currentTarget.src = FALLBACK_IMG
                            }
                          }}
                        />
                      </div>

                      <div>
                        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                          <div>
                            <div className="request-item-title">{title}</div>
                            <div className="request-item-meta">
                              Материал: {materialLabel(item.beam_material)}{' '}
                              {item.deflection_mm != null ? `· Прогиб: ${item.deflection_mm} мм` : ''}
                            </div>
                          </div>

                          <div className="d-flex gap-2 align-items-center">
                            <Link to={`/beams/${item.beam_id}`} className="btn btn-outline-light btn-sm">
                              Подробнее
                            </Link>
                            {isDraft && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => onRemoveItem(item.beam_id)}
                                disabled={isUpdating || loading}
                              >
                                {isUpdating ? <Spinner size="sm" animation="border" /> : 'Удалить'}
                              </Button>
                            )}
                          </div>
                        </div>

                        <Row className="g-2 mt-3">
                          <Col xs={12} md={4}>
                            <Form.Group controlId={`request-length-${item.beam_id}`}>
                              <Form.Label>Длина, м</Form.Label>
                              <Form.Control
                                type="number"
                                step="0.001"
                                min="0"
                                value={lengthsM[item.beam_id] ?? ''}
                                onChange={(e) =>
                                  setLengthsM((prev) => ({
                                    ...prev,
                                    [item.beam_id]: e.target.value,
                                  }))
                                }
                                onBlur={() => void saveItemFields(item.beam_id)}
                                disabled={!canEdit || loading}
                              />
                            </Form.Group>
                          </Col>

                          <Col xs={12} md={4}>
                            <Form.Group controlId={`request-udl-${item.beam_id}`}>
                              <Form.Label>Нагрузка q, кН/м</Form.Label>
                              <Form.Control
                                type="number"
                                step="0.001"
                                min="0"
                                value={udlKnM[item.beam_id] ?? ''}
                                onChange={(e) =>
                                  setUdlKnM((prev) => ({
                                    ...prev,
                                    [item.beam_id]: e.target.value,
                                  }))
                                }
                                onBlur={() => void saveItemFields(item.beam_id)}
                                disabled={!canEdit || loading}
                              />
                            </Form.Group>
                          </Col>

                          <Col xs={12} md={4}>
                            <Form.Group controlId={`request-qty-${item.beam_id}`}>
                              <Form.Label>Количество</Form.Label>
                              <div className="d-flex align-items-center gap-2">
                                <span className="text-muted fw-semibold">×</span>
                                <Form.Control
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={quantities[item.beam_id] ?? String(item.quantity)}
                                  onChange={(e) =>
                                    setQuantities((prev) => ({
                                      ...prev,
                                      [item.beam_id]: e.target.value,
                                    }))
                                  }
                                  onBlur={() => onUpdateQuantity(item.beam_id)}
                                  disabled={!isDraft || isUpdating || loading}
                                />
                              </div>
                            </Form.Group>
                          </Col>
                        </Row>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <hr />

            <Form>
              <Row className="g-3">
                <Col md={12}>
                  <Form.Group controlId="request-note">
                    <Form.Label>Комментарий</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onBlur={() => void saveNote()}
                      disabled={!canEdit || loading}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
                <div className="text-muted">
                  {user?.email ? (
                    <>
                      Заказчик: <span className="fw-semibold">{user.email}</span>
                    </>
                  ) : null}
                </div>
                {isDraft && (
                  <Button variant="accent" onClick={() => void saveAll()} disabled={loading}>
                    {loading ? <Spinner size="sm" animation="border" /> : 'Сохранить поля'}
                  </Button>
                )}
              </div>
            </Form>
          </Card.Body>
        </Card>
      )}
    </div>
  )
}
