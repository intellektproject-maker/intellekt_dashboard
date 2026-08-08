/**
 * Durable notification-outbox helper for the all-role web backend.
 *
 * Pass the SAME pg client used by the endpoint transaction. This ensures the
 * academic record and its notification event commit or roll back together.
 */
async function queueNotificationEvent(client, event) {
  const {
    eventKey,
    moduleName,
    className,
    board,
    subjectId = null,
    title,
    message,
    payload = {},
  } = event;

  if (!client || typeof client.query !== 'function') {
    throw new Error('A PostgreSQL transaction client is required');
  }

  if (!eventKey || !moduleName || !className || !board || !title || !message) {
    throw new Error('Missing required notification event fields');
  }

  const result = await client.query(
    `
      INSERT INTO notification_events (
        event_key,
        module_name,
        class_name,
        board,
        subject_id,
        title,
        message,
        payload,
        status,
        attempts,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb,
              'pending', 0, CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
    `,
    [
      String(eventKey).trim(),
      String(moduleName).trim(),
      String(className).trim(),
      String(board).trim(),
      subjectId,
      String(title).trim(),
      String(message).trim(),
      JSON.stringify(payload),
    ]
  );

  return {
    queued: result.rowCount > 0,
    eventId: result.rows[0]?.id ?? null,
  };
}

function makeEventKey(...parts) {
  return parts
    .map((part) => String(part ?? '').trim().toUpperCase())
    .join(':');
}

module.exports = {
  makeEventKey,
  queueNotificationEvent,
};
