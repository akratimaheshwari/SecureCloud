// Turns any axios error into { status, code, message, details, requestId }.
export function getApiError(err) {
  const body = err?.response?.data?.error;
  if (body) {
    return {
      status: err.response.status,
      code: body.code,
      message: formatMessage(body),
      details: body.details,
      requestId: body.requestId,
    };
  }
  if (!err?.response) {
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the server. Check that the backend is running and that CORS allows this address.',
    };
  }
  return { status: err.response.status, code: 'UNKNOWN', message: err.message || 'Something went wrong' };
}

// Validation errors list the failing fields in `details` ([{ in, field, message }])
function formatMessage(body) {
  if (body.code === 'VALIDATION_ERROR' && Array.isArray(body.details) && body.details.length) {
    return body.details.map((d) => (typeof d === 'string' ? d : d.message)).join('. ');
  }
  return body.message || 'Request failed';
}

export const errorMessage = (err) => getApiError(err).message;
