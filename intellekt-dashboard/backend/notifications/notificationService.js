const pool = require("../db");

async function createNotification({
  rollNo,
  moduleName,
  title,
  message,
  referenceId = null,
  testCode = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO student_notifications
      (
        roll_no,
        module_name,
        title,
        message,
        reference_id,
        test_code,
        is_read
      )
      VALUES ($1,$2,$3,$4,$5,$6,false)
      RETURNING *;
    `,
    [
      rollNo,
      moduleName,
      title,
      message,
      referenceId,
      testCode,
    ]
  );

  return result.rows[0];
}

module.exports = {
  createNotification,
};