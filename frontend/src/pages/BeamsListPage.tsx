import { useEffect } from 'react'
import { Alert, Col, Form, InputGroup, Row, Spinner, Stack } from 'react-bootstrap'
import { BeamCard } from '../components/BeamCard'
import { selectIsAuthenticated } from '../store/authSlice'
import { addBeamToDraftAsync, selectDraftAddingBeamIds } from '../store/draftSlice'
import { fetchBeamsAsync, selectBeams, selectBeamsError, selectBeamsLoading } from '../store/beamsSlice'
import { applyFilters, selectAppliedFilters, selectCurrentFilters, setFilters } from '../store/filtersSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'

export function BeamsListPage() {
  const dispatch = useAppDispatch()
  const currentFilters = useAppSelector(selectCurrentFilters)
  const appliedFilters = useAppSelector(selectAppliedFilters)
  const isAuthed = useAppSelector(selectIsAuthenticated)

  const beams = useAppSelector(selectBeams)
  const loading = useAppSelector(selectBeamsLoading)
  const error = useAppSelector(selectBeamsError)
  const addingBeamIds = useAppSelector(selectDraftAddingBeamIds)

  useEffect(() => {
    dispatch(fetchBeamsAsync(appliedFilters))
  }, [dispatch, appliedFilters])

  return (
    <Stack gap={2} className="page-container">
      <div className="section-title">Типы балок</div>

      <div className="search-bar">
        <InputGroup>
          <Form.Control
            placeholder="Поиск по названию..."
            value={currentFilters.name || ''}
            onChange={(e) => dispatch(setFilters({ name: e.target.value, page: 1 }))}
            onKeyDown={(e) => e.key === 'Enter' && dispatch(applyFilters(undefined))}
          />
          <button
            className="btn btn-search"
            type="button"
            onClick={() => dispatch(applyFilters(undefined))}
            disabled={loading}
          >
            Найти
          </button>
        </InputGroup>
      </div>

      {error && <Alert variant="danger">Не удалось загрузить данные: {error}</Alert>}

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" role="status" />
        </div>
      ) : beams.length === 0 ? (
        <Alert variant="info">Нет балок по заданным фильтрам.</Alert>
      ) : (
        <Row xs={1} md={2} className="g-3">
          {beams.map((beam) => (
            <Col key={beam.id}>
              <BeamCard
                beam={beam}
                onAdd={isAuthed ? () => dispatch(addBeamToDraftAsync({ beamId: beam.id })) : undefined}
                addLoading={addingBeamIds.includes(beam.id)}
                addDisabled={!isAuthed}
              />
            </Col>
          ))}
        </Row>
      )}
    </Stack>
  )
}

