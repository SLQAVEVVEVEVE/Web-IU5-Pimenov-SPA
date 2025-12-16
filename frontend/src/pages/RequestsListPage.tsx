import { useEffect } from 'react'
import { Alert, Spinner, Table } from 'react-bootstrap'
import { Link, Navigate } from 'react-router-dom'
import { selectIsAuthenticated } from '../store/authSlice'
import { fetchRequestsAsync, selectRequests, selectRequestsError, selectRequestsLoading } from '../store/requestsSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import type { BeamDeflectionStatus } from '../types'

const statusLabel = (status: BeamDeflectionStatus) => {
  switch (status) {
    case 'draft':
      return 'Черновик'
    case 'formed':
      return 'Сформирована'
    case 'completed':
      return 'Выполнена'
    case 'rejected':
      return 'Отклонена'
    case 'deleted':
      return 'Удалена'
    default:
      return status
  }
}

export function RequestsListPage() {
  const dispatch = useAppDispatch()

  const isAuthed = useAppSelector(selectIsAuthenticated)
  const loading = useAppSelector(selectRequestsLoading)
  const error = useAppSelector(selectRequestsError)
  const requests = useAppSelector(selectRequests)

  useEffect(() => {
    if (!isAuthed) return
    dispatch(fetchRequestsAsync(undefined))
  }, [dispatch, isAuthed])

  if (!isAuthed) return <Navigate to="/login" replace />

  return (
    <div className="page-container">
      <h2 className="mb-3">Мои заявки</h2>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" role="status" />
        </div>
      ) : requests.length === 0 ? (
        <Alert variant="info">Заявок пока нет.</Alert>
      ) : (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>ID</th>
              <th>Статус</th>
              <th>Дата формирования</th>
              <th>Результат, мм</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.id}</td>
                <td>{statusLabel(request.status)}</td>
                <td>{request.formed_at ? new Date(request.formed_at).toLocaleString() : '-'}</td>
                <td>{request.result_deflection_mm ?? '-'}</td>
                <td className="text-nowrap">
                  <Link className="btn btn-sm btn-accent" to={`/requests/${request.id}`}>
                    Открыть
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
