import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { api } from '../api'
import type { BeamDeflectionListItem, BeamDeflectionStatus } from '../types'

type RequestsState = {
  items: BeamDeflectionListItem[]
  loading: boolean
  error: string | null
}

const initialState: RequestsState = {
  items: [],
  loading: false,
  error: null,
}

type RequestsFilters = { status?: Exclude<BeamDeflectionStatus, 'deleted'>; from?: string; to?: string } | undefined

type BeamDeflectionListRow = NonNullable<
  Awaited<ReturnType<typeof api.api.beamDeflectionsList>>['data']['beam_deflections']
>[number]

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return 'Request failed'
}

export const fetchRequestsAsync = createAsyncThunk<
  BeamDeflectionListItem[],
  RequestsFilters,
  { rejectValue: string }
>('requests/fetch', async (filters, { rejectWithValue }) => {
  try {
    const response = await api.api.beamDeflectionsList(
      filters
        ? {
            status: filters.status,
            from: filters.from,
            to: filters.to,
          }
        : undefined,
    )

    const list: BeamDeflectionListRow[] = response.data.beam_deflections ?? []
    return list.map(
      (row): BeamDeflectionListItem => ({
        id: Number(row.id ?? 0),
        status: (row.status ?? 'draft') as BeamDeflectionStatus,
        note: row.note ?? null,
        formed_at: row.formed_at ?? null,
        completed_at: row.completed_at ?? null,
        creator_login: row.creator_login ?? null,
        moderator_login: row.moderator_login ?? null,
        result_deflection_mm: row.result_deflection_mm ?? null,
      }),
    )
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error))
  }
})

const requestsSlice = createSlice({
  name: 'requests',
  initialState,
  reducers: {
    resetRequests: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRequestsAsync.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchRequestsAsync.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchRequestsAsync.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'Failed to load requests'
        state.items = []
      })

    builder.addMatcher(
      (action) => action.type === 'auth/logout/fulfilled' || action.type === 'auth/logout/rejected',
      () => initialState,
    )
  },
})

export const { resetRequests } = requestsSlice.actions

export const selectRequests = (state: { requests: RequestsState }) => state.requests.items
export const selectRequestsLoading = (state: { requests: RequestsState }) => state.requests.loading
export const selectRequestsError = (state: { requests: RequestsState }) => state.requests.error

export default requestsSlice.reducer
