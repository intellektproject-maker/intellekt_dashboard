const express = require('express');
const cors = require('cors');
const pool = require('./db');
const crypto = require("node:crypto");
const { makeEventKey, queueNotificationEvent } = require('./web-notification-outbox');
const app = express();

const {
	createFacultyNotification
} = require('./faculty-notification-service');

app.use(cors());
app.use(express.json());

/* =========================================================
	HELPERS
========================================================= */
function formatTimeFromMinutes(totalMinutes) {
	const hours24 = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	const suffix = hours24 >= 12 ? 'PM' : 'AM';
	const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

	return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function timeStringToMinutes(timeString) {
	const [ hours, minutes ] = String(timeString).split(':').map(Number);
	return hours * 60 + minutes;
}

function getFixedSlots(durationMinutes) {
	const duration = Number(durationMinutes);

	if (duration === 90) {
		return [
			{ start: '07:00', end: '08:30' },
			{ start: '08:30', end: '10:00' },
			{ start: '10:00', end: '11:30' },
			{ start: '11:30', end: '13:00' }
		];
	}

	if (duration === 180) {
		return [ { start: '07:00', end: '10:00' }, { start: '10:00', end: '13:00' } ];
	}

	return [];
}

function isSunday(dateStr) {
	return new Date(dateStr).getDay() === 0;
}

function getNextMonday(dateValue) {
	const date = new Date(dateValue);
	date.setHours(0, 0, 0, 0);

	const day = date.getDay();
	let daysToAdd;

	if (day === 1) daysToAdd = 7;
	else if (day === 0) daysToAdd = 1;
	else daysToAdd = 8 - day;

	date.setDate(date.getDate() + daysToAdd);
	return date;
}

async function cleanupCompletedTasks() {
	const result = await pool.query(`
		SELECT id, completed_at
		FROM faculty_tasks
		WHERE is_completed = TRUE
		AND completed_at IS NOT NULL
	`);

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	for (const row of result.rows) {
		const deleteOn = getNextMonday(row.completed_at);

		if (today >= deleteOn) {
			await pool.query(`DELETE FROM faculty_tasks WHERE id = $1`, [ row.id ]);
		}
	}
}

/* =========================================================
	REQUEST LOGGER
	========================================================= */
app.use((req, res, next) => {
	console.log('API CALL:', req.method, req.url);
	next();
});

/* =========================================================
	TEST ROUTE
	========================================================= */
app.get('/', (req, res) => {
	res.send('API is working');
});

app.get('/_debug/student-answer-sheet-data/:rollNo', (req, res) => {
	res.json({
		ok: true,
		route: '/student-answer-sheet-data/:rollNo',
		params: req.params
	});
});

/* =========================================================
	LOGIN / AUTH
	========================================================= */
app.post('/login', async (req, res) => {
	const { id, password } = req.body || {};

	if (!id || !password) {
		return res.status(400).json({ error: 'id and password are required' });
	}

	const idUpper = String(id).toUpperCase().trim();
	const prefix = idUpper.substring(0, 2);

	try {
		if (prefix === 'IG' || prefix === 'IP') {
			const result = await pool.query(
				`SELECT faculty_id, password, must_reset_password FROM faculty WHERE faculty_id = $1`,
				[ idUpper ]
			);

			if (result.rows.length === 0) {
				return res.status(401).json({ error: 'Invalid credentials' });
			}

			const user = result.rows[0];

			if (String(user.password) !== String(password)) {
				return res.status(401).json({ error: 'Invalid credentials' });
			}

			return res.json({
				success: true,
				role: prefix === 'IG' ? 'faculty' : 'admin',
				id: idUpper,
				mustResetPassword: user.must_reset_password === true
			});
		}

		if (idUpper.startsWith('IAT')) {
			const result = await pool.query(
				'SELECT roll_no, password, must_reset_password FROM test_batch_students WHERE roll_no = $1',
				[ idUpper ]
			);

			if (result.rows.length === 0) {
				return res.status(401).json({ error: 'Invalid credentials' });
			}

			const user = result.rows[0];

			if (String(user.password) !== String(password)) {
				return res.status(401).json({ error: 'Invalid credentials' });
			}

			return res.json({
				success: true,
				role: 'test-batch-student',
				id: idUpper,
				mustResetPassword: user.must_reset_password === true
			});
		}

		if (prefix === 'IA') {
			const result = await pool.query(
				`SELECT roll_no, password, must_reset_password FROM students WHERE roll_no = $1`,
				[ idUpper ]
			);

			if (result.rows.length === 0) {
				return res.status(401).json({ error: 'Invalid credentials' });
			}

			const user = result.rows[0];

			if (String(user.password) !== String(password)) {
				return res.status(401).json({ error: 'Invalid credentials' });
			}

			return res.json({
				success: true,
				role: 'student',
				id: idUpper,
				mustResetPassword: user.must_reset_password === true
			});
		}

		return res.status(400).json({ error: 'Invalid id format' });
	} catch (err) {
		console.error('POST /login error:', err);
		res.status(500).json({ error: 'Server error' });
	}
});

/* =========================================================
   RESET PASSWORD
========================================================= */
app.put('/reset-password', async (req, res) => {
	const { id, role, newPassword } = req.body;

	try {
		if (!id || !role || !newPassword) {
			return res.status(400).json({
				error: 'Missing required fields'
			});
		}

		if (role === 'test-batch-student') {
			await pool.query(
				'UPDATE test_batch_students SET password = $1, must_reset_password = false, updated_at = CURRENT_TIMESTAMP WHERE roll_no = $2',
				[ newPassword, id ]
			);
		} else if (role === 'student') {

			await pool.query(
				`
				UPDATE students
				SET
					password = $1,
					must_reset_password = false
				WHERE roll_no = $2
				`,
				[ newPassword, id ]
			);
		} else {
			await pool.query(
				`
				UPDATE faculty
				SET
					password = $1,
					must_reset_password = false
				WHERE faculty_id = $2
				`,
				[ newPassword, id ]
			);
		}

		res.json({
			success: true,
			message: 'Password updated successfully'
		});
	} catch (err) {
		console.error('RESET PASSWORD ERROR:', err);

		res.status(500).json({
			error: 'Failed to reset password'
		});
	}
});
/* =========================================================
	STUDENT PROFILE
	========================================================= */
app.get('/student/:rollNo', async (req, res) => {
	const { rollNo } = req.params;

	try {
		const result = await pool.query(`SELECT * FROM students WHERE roll_no = $1`, [ rollNo ]);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Student not found' });
		}

		res.json(result.rows[0]);
	} catch (err) {
		console.error('GET /student/:rollNo error:', err);
		res.status(500).json({ error: 'Server error' });
	}
});

/* =========================================================
	STUDENT ATTENDANCE
	========================================================= */
app.get('/attendance/:rollNo', async (req, res) => {
	const { rollNo } = req.params;

	try {
		const result = await pool.query(
			`
				SELECT roll_no, subject_id, attendance_date, status, updated_by
				FROM attendance
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
				ORDER BY attendance_date DESC
				`,
			[ rollNo ]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /attendance/:rollNo error:', err);
		res.status(500).json({ error: 'Server error' });
	}
});
/* =========================================================
	STUDENT MARKS
	========================================================= */
app.get('/marks/:roll', async (req, res) => {
  const { roll } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        m.test_code,
        m.marks_obtained,
        m.comments,
        COALESCE(m.total_marks, t.total_marks) AS total_marks,
        t.test_date,
        t.subject_id,
        t.chapter,
        CASE
          WHEN t.subject_id = 1 THEN 'Maths'
          WHEN t.subject_id = 2 THEN 'Physics'
          ELSE 'Archived Test'
        END AS subject_name
      FROM marks m
      LEFT JOIN tests t
        ON UPPER(TRIM(m.test_code)) = UPPER(TRIM(t.test_code))
      WHERE UPPER(TRIM(m.roll_no)) = UPPER(TRIM($1))
      ORDER BY COALESCE(t.test_date, CURRENT_DATE) DESC, m.test_code ASC
      `,
      [roll]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('GET /marks/:roll error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


/* =========================================================
	TEST SCHEDULE WITH REGISTRATION DETAILS
	========================================================= */
app.get('/test-schedule/:roll', async (req, res) => {
	const { roll } = req.params;

	try {
		const result = await pool.query(
			`
			SELECT 
	t.test_code,
	t.subject_id,
	COALESCE(sub.subject_name, 'Unknown') AS subject_name,
	t.test_date,
	t.total_marks,
	t.portion,
	t.duration_minutes,
	t.registration_end_date,
	t.writing_allowed_till,
	r.slot_start,
	r.slot_end,
	r.writing_date
			FROM students s
			JOIN student_subjects ss
				ON UPPER(TRIM(ss.roll_no)) = UPPER(TRIM(s.roll_no))
			JOIN tests t
				ON TRIM(t.class) = TRIM(s.class)
				AND UPPER(TRIM(t.board)) = UPPER(TRIM(s.board))
				AND t.subject_id = ss.subject_id
			LEFT JOIN subjects sub
				ON sub.subject_id = t.subject_id
			LEFT JOIN test_registrations r
				ON UPPER(TRIM(r.test_code)) = UPPER(TRIM(t.test_code))
				AND UPPER(TRIM(r.roll_no)) = UPPER(TRIM(s.roll_no))
			WHERE UPPER(TRIM(s.roll_no)) = UPPER(TRIM($1))
			ORDER BY t.test_date ASC, t.test_code ASC
			`,
			[roll]
		);

		const formatted = result.rows.map((row) => ({
			test_code: row.test_code,
			subject_id: row.subject_id,
			subject_name: row.subject_name,
			test_date: row.test_date,
			total_marks: row.total_marks,
			portion: row.portion,
			duration_minutes: row.duration_minutes,
			registration_end_date: row.registration_end_date,
			writing_allowed_till: row.writing_allowed_till,
			is_registered: !!row.writing_date,
			writing_date: row.writing_date || null,
			registered_slot_label:
				row.slot_start && row.slot_end
					? `${String(row.slot_start).slice(0, 5)} - ${String(row.slot_end).slice(0, 5)}`
					: null
		}));

		res.json(formatted);
	} catch (err) {
		console.error('GET /test-schedule/:roll error:', err);
		res.status(500).json({ error: 'Failed to fetch schedule' });
	}
});
/* =========================================================
	TEST SLOTS
	========================================================= */
app.get('/test-slots/:testCode/:rollNo', async (req, res) => {
	const { testCode, rollNo } = req.params;
	const { writing_date } = req.query;

	try {
		const testResult = await pool.query(
			`
		SELECT test_code, subject_id, test_date, duration_minutes, class, board,
				registration_end_date, writing_allowed_till
		FROM tests
		WHERE test_code = $1
		`,
			[ testCode ]
		);

		if (testResult.rows.length === 0) {
			return res.status(404).json({ error: 'Test not found' });
		}

		const test = testResult.rows[0];

		const studentResult = await pool.query(`SELECT roll_no, name, class, board FROM students WHERE roll_no = $1`, [
			rollNo
		]);

		if (studentResult.rows.length === 0) {
			return res.status(404).json({ error: 'Student not found' });
		}

		const student = studentResult.rows[0];

		if (
	String(student.class).trim() !== String(test.class).trim() ||
	String(student.board).trim().toUpperCase() !== String(test.board).trim().toUpperCase()
) {
	return res.status(403).json({
		error: "This test does not belong to the student's class/board"
	});
}

const subjectCheck = await pool.query(
	`
	SELECT 1
	FROM student_subjects
	WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
	AND subject_id = $2
	LIMIT 1
	`,
	[rollNo, test.subject_id]
);

if (subjectCheck.rows.length === 0) {
	return res.status(403).json({
		error: 'This student is not enrolled for this test subject'
	});
}

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const registrationEndDate = new Date(test.registration_end_date);
		registrationEndDate.setHours(0, 0, 0, 0);

		if (today > registrationEndDate) {
			return res.status(400).json({
				error: 'Registration period has ended for this test'
			});
		}

		const selectedWritingDate = writing_date || test.test_date;

		const selectedDateObj = new Date(selectedWritingDate);
		selectedDateObj.setHours(0, 0, 0, 0);

		const testDateObj = new Date(test.test_date);
		testDateObj.setHours(0, 0, 0, 0);

		const writingAllowedTillObj = new Date(test.writing_allowed_till);
		writingAllowedTillObj.setHours(0, 0, 0, 0);

		if (selectedDateObj < testDateObj || selectedDateObj > writingAllowedTillObj) {
			return res.status(400).json({
				error: 'Selected writing date is outside the allowed range'
			});
		}

		const existingSameTest = await pool.query(
			`
		SELECT id
		FROM test_registrations
		WHERE roll_no = $1 AND test_code = $2
		LIMIT 1
		`,
			[ rollNo, testCode ]
		);

		if (existingSameTest.rows.length > 0) {
			return res.status(400).json({
				error: 'Student already registered for this test'
			});
		}

		if (!isSunday(selectedWritingDate)) {
			return res.json({
				requires_slot: false,
				slots: []
			});
		}

		const existingRegistrations = await pool.query(
			`
		SELECT slot_start, slot_end
		FROM test_registrations
		WHERE roll_no = $1
			AND writing_date = $2
			AND slot_start IS NOT NULL
		`,
			[ rollNo, selectedWritingDate ]
		);

		const bookedIntervals = existingRegistrations.rows.map((row) => ({
			start: String(row.slot_start).slice(0, 5),
			end: String(row.slot_end).slice(0, 5)
		}));

		const allSlots = getFixedSlots(test.duration_minutes);

		const availableSlots = allSlots.filter(
			(slot) => !bookedIntervals.some((booked) => booked.start === slot.start && booked.end === slot.end)
		);

		res.json({
			requires_slot: true,
			slots: availableSlots
		});
	} catch (error) {
		console.error('GET /test-slots/:testCode/:rollNo error:', error);
		res.status(500).json({ error: 'Failed to fetch available slots' });
	}
});

/* =========================================================
	REGISTER TEST SLOT
	========================================================= */
app.post('/register-test-slot', async (req, res) => {
	const client = await pool.connect();

	try {
		const { roll_no, test_code, slot_start, slot_end, writing_date } = req.body;

		if (!roll_no || !test_code || !writing_date) {
			return res.status(400).json({
				error: 'roll_no, test_code and writing_date are required'
			});
		}

		const isWritingOnSunday = isSunday(writing_date);

		if (isWritingOnSunday && (!slot_start || !slot_end)) {
			return res.status(400).json({
				error: 'slot_start and slot_end are required for Sunday writing dates'
			});
		}

		await client.query('BEGIN');

		const testResult = await client.query(
			`
		SELECT test_code, subject_id, test_date, duration_minutes, class, board,
				registration_end_date, writing_allowed_till
		FROM tests
		WHERE test_code = $1
		`,
			[ test_code ]
		);

		if (testResult.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Test not found' });
		}

		const test = testResult.rows[0];

		const studentResult = await client.query(
			`SELECT roll_no, name, class, board FROM students WHERE roll_no = $1`,
			[ roll_no ]
		);

		if (studentResult.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Student not found' });
		}

		const student = studentResult.rows[0];

		if (
	String(student.class).trim() !== String(test.class).trim() ||
	String(student.board).trim().toUpperCase() !== String(test.board).trim().toUpperCase()
) {
	await client.query('ROLLBACK');
	return res.status(403).json({
		error: "This test does not belong to the student's class/board"
	});
}

const subjectCheck = await client.query(
	`
	SELECT 1
	FROM student_subjects
	WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
	AND subject_id = $2
	LIMIT 1
	`,
	[roll_no, test.subject_id]
);

if (subjectCheck.rows.length === 0) {
	await client.query('ROLLBACK');
	return res.status(403).json({
		error: 'This student is not enrolled for this test subject'
	});
}

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const registrationEndDate = new Date(test.registration_end_date);
		registrationEndDate.setHours(0, 0, 0, 0);

		if (today > registrationEndDate) {
			await client.query('ROLLBACK');
			return res.status(400).json({
				error: 'Registration period has ended for this test'
			});
		}

		const selectedWritingDate = new Date(writing_date);
		selectedWritingDate.setHours(0, 0, 0, 0);

		const testDateObj = new Date(test.test_date);
		testDateObj.setHours(0, 0, 0, 0);

		const writingAllowedTillObj = new Date(test.writing_allowed_till);
		writingAllowedTillObj.setHours(0, 0, 0, 0);

		if (selectedWritingDate < testDateObj || selectedWritingDate > writingAllowedTillObj) {
			await client.query('ROLLBACK');
			return res.status(400).json({
				error: 'Selected writing date is outside the allowed range'
			});
		}

		const duplicateResult = await client.query(
			`
		SELECT id
		FROM test_registrations
		WHERE roll_no = $1 AND test_code = $2
		LIMIT 1
		`,
			[ roll_no, test_code ]
		);

		if (duplicateResult.rows.length > 0) {
			await client.query('ROLLBACK');
			return res.status(400).json({
				error: 'Student already registered for this test'
			});
		}

		if (isWritingOnSunday) {
			const validSlots = getFixedSlots(test.duration_minutes);
			const isValidSlot = validSlots.some((slot) => slot.start === slot_start && slot.end === slot_end);

			if (!isValidSlot) {
				await client.query('ROLLBACK');
				return res.status(400).json({
					error: 'Invalid slot selected for this test duration'
				});
			}

			const existingRegistrations = await client.query(
				`
			SELECT slot_start, slot_end
			FROM test_registrations
			WHERE roll_no = $1
			AND writing_date = $2
			AND slot_start IS NOT NULL
			`,
				[ roll_no, writing_date ]
			);

			const alreadyBooked = existingRegistrations.rows.some(
				(row) =>
					String(row.slot_start).slice(0, 5) === slot_start && String(row.slot_end).slice(0, 5) === slot_end
			);

			if (alreadyBooked) {
				await client.query('ROLLBACK');
				return res.status(400).json({
					error: 'Selected slot is already booked'
				});
			}
		}

		const insertResult = await client.query(
			`
		INSERT INTO test_registrations (
			roll_no,
			student_name,
			class,
			board,
			test_code,
			subject_id,
			test_date,
			writing_date,
			slot_start,
			slot_end,
			duration_minutes
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING *
		`,
			[
				student.roll_no,
				student.name,
				student.class,
				student.board,
				test.test_code,
				test.subject_id,
				test.test_date,
				writing_date,
				isWritingOnSunday ? slot_start : null,
				isWritingOnSunday ? slot_end : null,
				test.duration_minutes
			]
		);

		await client.query('COMMIT');

		res.status(201).json({
			message: 'Test slot registered successfully',
			registration: insertResult.rows[0]
		});
	} catch (error) {
		await client.query('ROLLBACK');
		console.error('POST /register-test-slot error:', error);

		if (error.code === '23505') {
			return res.status(400).json({
				error: 'Student already registered for this test'
			});
		}

		res.status(500).json({
			error: 'Failed to register test slot',
			details: error.message
		});
	} finally {
		client.release();
	}
});

app.get('/student-notifications/:roll', async (req, res) => {
	const { roll } = req.params;

	try {
		const result = await pool.query(
			`
		SELECT *
		FROM student_notifications
		WHERE roll_no = $1
		AND is_read = FALSE
		ORDER BY created_at DESC
		`,
			[ roll ]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET notifications error:', err);
		res.status(500).json({
			error: 'Failed to fetch notifications'
		});
	}
});

app.put('/student-notifications/read', async (req, res) => {
	const { roll_no, module_name } = req.body;

	try {
		await pool.query(
			`
				UPDATE student_notifications
				SET is_read = TRUE
				WHERE roll_no = $1
				AND module_name = $2
				`,
			[ roll_no, module_name ]
		);

		res.json({ message: 'Notifications marked as read' });
	} catch (err) {
		console.error('PUT /student-notifications/read error:', err);
		res.status(500).json({ error: 'Failed to update notifications' });
	}
});
app.get('/faculty-notifications/:facultyId', async (req, res) => {
	const { facultyId } = req.params;

	try {
		const result = await pool.query(
			`
				SELECT *
				FROM faculty_notifications
				WHERE faculty_id = $1
				AND is_read = FALSE
				ORDER BY created_at DESC
				`,
			[ facultyId ]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET faculty notifications error:', err);

		res.status(500).json({
			error: 'Failed to fetch faculty notifications'
		});
	}
});

app.put('/faculty-notifications/mark-read/:facultyId/:moduleName', async (req, res) => {
	try {
		const { facultyId, moduleName } = req.params;

		await pool.query(
			`
			UPDATE faculty_notifications
			SET is_read = TRUE
			WHERE faculty_id = $1
			  AND module_name = $2
			`,
			[facultyId, moduleName]
		);

		res.json({ message: 'Notifications marked as read' });
	} catch (err) {
		console.error('PUT /faculty-notifications/mark-read error:', err);

		res.status(500).json({
			error: 'Failed to mark notifications as read'
		});
	}
});

/* =========================================================
	FEES
	========================================================= */
app.get('/fees/:roll', async (req, res) => {
	const { roll } = req.params;

	try {
		/* -----------------------------------------
		   GET CURRENT FEE
		----------------------------------------- */

		const feeResult = await pool.query(
			`
			SELECT
				id,
				roll_no,
				total_fee,
				fee_paid,
				next_due
			FROM fees
			WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
			`,
			[roll]
		);

		if (feeResult.rows.length === 0) {
			return res.json([]);
		}

		/* -----------------------------------------
		   GET PAYMENT HISTORY
		----------------------------------------- */

		const paymentResult = await pool.query(
			`
			SELECT
				id,
				amount_paid,
				total_paid,
				balance,
				payment_date,
				next_due
			FROM fee_payments
			WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
			ORDER BY payment_date ASC, id ASC
			`,
			[roll]
		);

		/* -----------------------------------------
		   FORMAT RESPONSE
		----------------------------------------- */

		const formattedFees = feeResult.rows.map((fee) => ({
			id: fee.id,
			roll_no: fee.roll_no,
			total_fee: Number(fee.total_fee || 0),
			fee_paid: Number(fee.fee_paid || 0),
			balance: Math.max(
				0,
				Number(fee.total_fee || 0) -
				Number(fee.fee_paid || 0)
			),
			next_due: fee.next_due,

			payment_history: paymentResult.rows.map((payment) => ({
				id: payment.id,
				amount_paid: Number(payment.amount_paid || 0),
				total_paid: Number(payment.total_paid || 0),
				balance: Number(payment.balance || 0),
				payment_date: payment.payment_date,
				next_due: payment.next_due
			}))
		}));

		res.json(formattedFees);

	} catch (err) {
		console.error('GET /fees/:roll error:', err);

		res.status(500).json({
			error: 'Database error',
			details: err.message
		});
	}
});/* =========================================================
   FACULTY - GET ALL STUDENT FEES
========================================================= */

app.get('/faculty/fees', async (req, res) => {
	try {
		const result = await pool.query(`
			SELECT
				s.roll_no,
				s.name,
				TRIM(s.class) AS class,
				TRIM(s.board) AS board,
				COALESCE(f.total_fee, 0) AS total_fee,
				COALESCE(f.fee_paid, 0) AS paid_amount,
				COALESCE(f.total_fee, 0) - COALESCE(f.fee_paid, 0) AS pending_amount,
				f.next_due AS due_date,
				f.reminder_enabled AS reminder_enabled,
				CASE
					WHEN COALESCE(f.total_fee, 0) > 0
						AND COALESCE(f.fee_paid, 0) >= COALESCE(f.total_fee, 0)
					THEN 'Paid'
					WHEN COALESCE(f.fee_paid, 0) > 0
						AND COALESCE(f.fee_paid, 0) < COALESCE(f.total_fee, 0)
					THEN 'Partial'
					ELSE 'Pending'
				END AS status
			FROM students s
			LEFT JOIN fees f
				ON UPPER(TRIM(s.roll_no)) = UPPER(TRIM(f.roll_no))
			ORDER BY s.roll_no ASC
		`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /faculty/fees error:', err);

		res.status(500).json({
			error: 'Failed to fetch student fee details',
			details: err.message
		});
	}
});
/* =========================================================
   FACULTY - UPDATE STUDENT FEE
========================================================= */

app.put('/faculty/fees/:rollNo', async (req, res) => {
	const { rollNo } = req.params;

	const {
		total_fee,
		paid_amount,
		due_date,
		status,
		reminder_enabled
	} = req.body;

	const client = await pool.connect();

	try {
		const totalFee = Number(total_fee);
		const paidAmount = Number(paid_amount);

		/* -----------------------------------------
		   VALIDATE FEE VALUES
		----------------------------------------- */

		if (
			Number.isNaN(totalFee) ||
			Number.isNaN(paidAmount) ||
			totalFee < 0 ||
			paidAmount < 0
		) {
			return res.status(400).json({
				error: 'Invalid fee amount'
			});
		}

		if (paidAmount > totalFee) {
			return res.status(400).json({
				error: 'Paid amount cannot be greater than total fee'
			});
		}

		await client.query('BEGIN');

		/* -----------------------------------------
		   CHECK STUDENT
		----------------------------------------- */

		const studentResult = await client.query(
			`
			SELECT
				roll_no,
				name,
				class,
				board
			FROM students
			WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
			`,
			[rollNo]
		);

		if (studentResult.rows.length === 0) {
			await client.query('ROLLBACK');

			return res.status(404).json({
				error: 'Student not found'
			});
		}

		const student = studentResult.rows[0];

		/* -----------------------------------------
		   GET EXISTING FEE
		----------------------------------------- */

		const feeCheck = await client.query(
			`
			SELECT
				id,
				total_fee,
				fee_paid,
				next_due
			FROM fees
			WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
			FOR UPDATE
			`,
			[rollNo]
		);

		let feeId;
		let previousPaidAmount = 0;
		let isNewFee = false;

		/* -----------------------------------------
		   CREATE NEW FEE
		----------------------------------------- */

		if (feeCheck.rows.length === 0) {
			isNewFee = true;

			const insertFeeResult = await client.query(
				`
				INSERT INTO fees (
					roll_no,
					total_fee,
					fee_paid,
					next_due
				)
				VALUES ($1, $2, $3, $4)
				RETURNING id
				`,
				[
					rollNo,
					totalFee,
					paidAmount,
					paidAmount >= totalFee ? null : (due_date || null)
				]
			);

			feeId = insertFeeResult.rows[0].id;

		} else {
			/* -----------------------------------------
			   EXISTING FEE
			----------------------------------------- */

			const existingFee = feeCheck.rows[0];

			feeId = existingFee.id;
			previousPaidAmount = Number(
				existingFee.fee_paid || 0
			);

			/* -----------------------------------------
			   UPDATE CURRENT FEE
			----------------------------------------- */

			await client.query(
				`
				UPDATE fees
				SET
					total_fee = $1,
					fee_paid = $2,
					next_due = $3
				WHERE id = $4
				`,
				[
					totalFee,
					paidAmount,
					paidAmount >= totalFee
						? null
						: (due_date || null),
					feeId
				]
			);
		}

		/* -----------------------------------------
		   CALCULATE NEW PAYMENT
		----------------------------------------- */

		const newPaymentAmount =
			paidAmount - previousPaidAmount;

		/*
		 * Only create a payment history record when
		 * the paid amount actually increases.
		 *
		 * Example:
		 *
		 * Previous paid = 10000
		 * New paid      = 15000
		 *
		 * New payment   = 5000
		 */

		if (newPaymentAmount > 0) {
			const balance = Math.max(
				0,
				totalFee - paidAmount
			);

			await client.query(
				`
				INSERT INTO fee_payments (
					fee_id,
					roll_no,
					amount_paid,
					total_paid,
					balance,
					payment_date,
					next_due
				)
				VALUES (
					$1,
					$2,
					$3,
					$4,
					$5,
					CURRENT_DATE,
					$6
				)
				`,
				[
					feeId,
					rollNo,
					newPaymentAmount,
					paidAmount,
					balance,
					balance > 0
						? (due_date || null)
						: null
				]
			);
		}

		/* -----------------------------------------
		   CALCULATE FINAL STATUS
		----------------------------------------- */

		const pendingAmount = Math.max(
			totalFee - paidAmount,
			0
		);

		const finalStatus =
			totalFee > 0 &&
			paidAmount >= totalFee
				? 'Paid'
				: paidAmount > 0
					? 'Partial'
					: 'Pending';

		/* -----------------------------------------
		   STUDENT NOTIFICATION
		----------------------------------------- */

		await client.query(
			`
			DELETE FROM student_notifications
			WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
			  AND module_name = 'fees'
			`,
			[rollNo]
		);

		await client.query(
			`
			INSERT INTO student_notifications
			(roll_no, module_name, message, is_read)
			VALUES ($1, 'fees', $2, FALSE)
			`,
			[
				rollNo,
				'Your fee details have been updated'
			]
		);

		/* -----------------------------------------
		   COMMIT
		----------------------------------------- */

		await client.query('COMMIT');

		res.json({
			message: 'Fee updated successfully',

			fee: {
				roll_no: rollNo,
				total_fee: totalFee,
				paid_amount: paidAmount,
				pending_amount: pendingAmount,
				due_date:
					paidAmount >= totalFee
						? null
						: (due_date || null),
				status: finalStatus,
				reminder_enabled:
					reminder_enabled === true,

				payment_recorded:
					newPaymentAmount > 0,

				payment_amount:
					newPaymentAmount > 0
						? newPaymentAmount
						: 0
			}
		});

	} catch (err) {
		await client.query('ROLLBACK');

		console.error(
			'PUT /faculty/fees/:rollNo error:',
			err
		);

		res.status(500).json({
			error: 'Failed to update fee',
			details: err.message
		});

	} finally {
		client.release();
	}
});/* =========================================================
   FACULTY - FEE REMINDER
========================================================= */

app.patch('/faculty/fees/:rollNo/reminder', async (req, res) => {
	const { rollNo } = req.params;
	const { enabled } = req.body;

	const client = await pool.connect();

	try {
		if (typeof enabled !== 'boolean') {
			return res.status(400).json({
				error: 'enabled must be true or false'
			});
		}

		await client.query('BEGIN');

		/* -----------------------------
		   CHECK FEE RECORD
		----------------------------- */

		const feeResult = await client.query(
			`
			SELECT
				total_fee,
				fee_paid
			FROM fees
			WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
			`,
			[rollNo]
		);

		if (feeResult.rows.length === 0) {
			await client.query('ROLLBACK');

			return res.status(404).json({
				error: 'Fee record not found'
			});
		}

		const fee = feeResult.rows[0];

		const totalFee = Number(
			fee.total_fee || 0
		);

		const paidAmount = Number(
			fee.fee_paid || 0
		);

		const isFullyPaid =
			totalFee > 0 &&
			paidAmount >= totalFee;

		/* -----------------------------
		   PREVENT REMINDER FOR PAID FEE
		----------------------------- */

		if (enabled && isFullyPaid) {
			await client.query('ROLLBACK');

			return res.status(400).json({
				error: 'Cannot enable reminder for a paid fee'
			});
		}

		/* -----------------------------
		   UPDATE REMINDER
		----------------------------- */

		        await client.query(
            `
            UPDATE fees
            SET
                reminder_enabled = $1,
                last_reminder_sent_at = CASE
                    WHEN $1 = TRUE THEN NULL
                    ELSE last_reminder_sent_at
                END
            WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($2))
            `,
            [
                enabled,
                rollNo
            ]
        );

		await client.query('COMMIT');

		res.json({
			message: enabled
				? 'Fee reminder enabled'
				: 'Fee reminder disabled',

			roll_no: rollNo,
			reminder_enabled: enabled
		});

	} catch (err) {
		await client.query('ROLLBACK');

		console.error(
			'PATCH /faculty/fees/:rollNo/reminder error:',
			err
		);

		res.status(500).json({
			error: 'Failed to update fee reminder',
			details: err.message
		});
	} finally {
		client.release();
	}
});

/* =========================================================
	FACULTY PROFILE
	========================================================= */
app.get('/faculty/:id', async (req, res) => {
	const { id } = req.params;

	try {
		const result = await pool.query(
			`
		SELECT 
			f.faculty_id,
			f.name,
			f.phone,
			f.email,
			f.subject_id,
			s.subject_name
		FROM faculty f
		LEFT JOIN subjects s
			ON f.subject_id = s.subject_id
		WHERE f.faculty_id = $1
		`,
			[ id ]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Faculty not found' });
		}

		res.json(result.rows[0]);
	} catch (err) {
		console.error('GET /faculty/:id error:', err);
		res.status(500).json({ error: 'Server error' });
	}
});
/* =========================================================
	MARKS SAVE / MANAGE / UPDATE
	========================================================= */
app.post('/marks', async (req, res) => {
	const { records } = req.body;

	if (!records || !Array.isArray(records) || records.length === 0) {
		return res.status(400).json({ error: 'records are required' });
	}

	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const queuedGroups = new Map();
		for (const record of records) {
			if (record.marks === undefined || record.marks === null || record.marks === '') {
				continue;
			}

			const testResult = await client.query(
				`
				SELECT test_code, subject_id, total_marks
				FROM tests
				WHERE UPPER(TRIM(test_code)) = UPPER(TRIM($1))
				`,
				[record.test_code]
			);

			if (testResult.rows.length === 0) {
				return res.status(400).json({
					error: `Invalid test code: ${record.test_code}`
				});
			}

			const test = testResult.rows[0];

			const studentResult = await client.query(
				`
				SELECT s.roll_no, s.name, s.class, s.board
				FROM students s
				JOIN student_subjects ss
					ON UPPER(TRIM(ss.roll_no)) = UPPER(TRIM(s.roll_no))
				WHERE UPPER(TRIM(s.roll_no)) = UPPER(TRIM($1))
				AND ss.subject_id = $2
				`,
				[record.roll_no, test.subject_id]
			);

			if (studentResult.rows.length === 0) {
				return res.status(400).json({
					error: `${record.roll_no} is not eligible for this test subject`
				});
			}

			const cleanMarks = String(record.marks).trim().toUpperCase();
			const totalMarks = Number(test.total_marks);

			if (cleanMarks !== 'A') {
				const obtainedMarks = Number(cleanMarks);

				if (!Number.isInteger(obtainedMarks) || obtainedMarks < 0) {
					return res.status(400).json({
						error: `Invalid marks for ${record.roll_no}`
					});
				}

				if (obtainedMarks > totalMarks) {
					return res.status(400).json({
						error: `Marks for ${record.roll_no} cannot be greater than total marks (${totalMarks})`
					});
				}
			}

					await client.query(
				`
				INSERT INTO marks (
					roll_no,
					student_name,
					test_code,
					marks_obtained,
					comments,
					total_marks
				)
				VALUES ($1, $2, $3, $4, $5, $6)
				ON CONFLICT (roll_no, test_code)
				DO UPDATE SET
					student_name = EXCLUDED.student_name,
					marks_obtained = EXCLUDED.marks_obtained,
					comments = EXCLUDED.comments,
					total_marks = EXCLUDED.total_marks
				`,
				[
					studentResult.rows[0].roll_no,
					studentResult.rows[0].name,
					String(test.test_code).toUpperCase().trim(),
					cleanMarks,
					cleanMarks === 'A' ? 'Absent' : record.comments || null,
					totalMarks
				]
			);

			await client.query(
				`
				DELETE FROM student_notifications
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
				  AND module_name = 'marks'
				`,
				[studentResult.rows[0].roll_no]
			);

			await client.query(
				`
				INSERT INTO student_notifications
				(roll_no, module_name, message, is_read)
				VALUES ($1, 'marks', 'New marks have been uploaded', FALSE)
				`,
				[studentResult.rows[0].roll_no]
			);

			const student = studentResult.rows[0];
			const eventKey = makeEventKey('marks', test.test_code, student.class, student.board);
			queuedGroups.set(eventKey, {
				eventKey,
				moduleName: 'marks',
				className: student.class,
				board: student.board,
				subjectId: Number(test.subject_id),
				title: 'Marks posted',
				message: `Marks for ${String(test.test_code).trim().toUpperCase()} have been posted`,
				payload: { test_code: String(test.test_code).trim().toUpperCase() }
			});
		}

		let notificationQueued = false;
		for (const event of queuedGroups.values()) {
			const queued = await queueNotificationEvent(client, event);
			notificationQueued = notificationQueued || queued.queued;
		}

		await client.query('COMMIT');
		res.json({ message: 'Marks saved successfully', notificationQueued });
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('POST /marks error:', err);
		res.status(500).json({
			error: 'Marks save failed',
			details: err.message
		});
	} finally {
		client.release();
	}
});
app.get('/marks', async (req, res) => {
	let { name, className, board, testCode } = req.query;

	try {
		if (className && String(className).includes('-') && !board) {
			const value = String(className).trim();
			const lastDash = value.lastIndexOf('-');

			board = value.slice(0, lastDash).trim();
			className = value.slice(lastDash + 1).trim();
		}

		let query = `
			SELECT 
				s.roll_no,
				s.name,
				TRIM(s.class) AS class,
				TRIM(s.board) AS board,
				m.test_code,
				m.marks_obtained,
				m.comments,
				COALESCE(m.total_marks, t.total_marks) AS total_marks
			FROM marks m
			JOIN students s
				ON UPPER(TRIM(m.roll_no)) = UPPER(TRIM(s.roll_no))
			LEFT JOIN tests t
	            ON UPPER(TRIM(m.test_code)) = UPPER(TRIM(t.test_code))
			WHERE 1=1
		`;

		const values = [];

		if (name) {
			values.push(`%${String(name).trim()}%`);
			query += ` AND s.name ILIKE $${values.length}`;
		}

		if (className) {
			values.push(String(className).trim());
			query += ` AND TRIM(s.class) = TRIM($${values.length})`;
		}

		if (board) {
			values.push(String(board).trim());
			query += ` AND TRIM(s.board) = TRIM($${values.length})`;
		}

		if (testCode) {
			values.push(String(testCode).trim());
			query += ` AND UPPER(TRIM(m.test_code)) = UPPER(TRIM($${values.length}))`;
		}

		query += ` ORDER BY s.roll_no ASC`;

		const result = await pool.query(query, values);
		res.json(result.rows);
	} catch (err) {
		console.error('GET /marks error:', err);
		res.status(500).json({
			error: 'Failed to fetch marks',
			details: err.message
		});
	}
});
app.put('/marks/:roll_no/:test_code', async (req, res) => {
	const { roll_no, test_code } = req.params;
	const { marks, comments } = req.body;

	try {
		const markResult = await pool.query(
			`
			SELECT total_marks
			FROM marks
			WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
			AND UPPER(TRIM(test_code)) = UPPER(TRIM($2))
			`,
			[ roll_no, test_code ]
		);

		if (markResult.rows.length === 0) {
			return res.status(404).json({ error: 'Mark record not found' });
		}

		const totalMarks = Number(markResult.rows[0].total_marks);

const cleanMarks = String(marks).trim().toUpperCase();

if (cleanMarks !== 'A') {
	const obtainedMarks = Number(cleanMarks);

	if (!Number.isInteger(obtainedMarks) || obtainedMarks < 0) {
		return res.status(400).json({
			error: 'Invalid marks entered'
		});
	}

	if (obtainedMarks > totalMarks) {
		return res.status(400).json({
			error: `Marks cannot be greater than total marks (${totalMarks})`
		});
	}
}
const newComment = (() => {
			if (cleanMarks === 'A') return 'Absent';
			const percentage = (Number(cleanMarks) / totalMarks) * 100;
			if (percentage >= 90) return 'Excellent';
			if (percentage >= 75) return 'Very Good';
			if (percentage >= 60) return 'Good';
			if (percentage >= 40) return 'Average';
			return 'Needs Improvement';
		})();

		await pool.query(
			`
			UPDATE marks
			SET marks_obtained = $1,
				comments = $2
			WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($3))
			AND UPPER(TRIM(test_code)) = UPPER(TRIM($4))
			`,
			[
				cleanMarks,
				newComment,
				roll_no,
				test_code
			]
		);

		res.json({ message: 'Marks updated successfully' });
	} catch (err) {
		console.error('PUT /marks/:roll_no/:test_code error:', err);
		res.status(500).json({ error: 'Failed to update marks' });
	}
});
app.put('/update-marks', async (req, res) => {
	const { name, test_code, marks_obtained } = req.body;

	try {
		const markResult = await pool.query(
			`
			SELECT m.total_marks
			FROM marks m
			JOIN students s
				ON UPPER(TRIM(m.roll_no)) = UPPER(TRIM(s.roll_no))
			WHERE s.name = $1
			AND UPPER(TRIM(m.test_code)) = UPPER(TRIM($2))
			`,
			[ name, test_code ]
		);

		if (markResult.rows.length === 0) {
			return res.status(404).json({ error: 'Mark record not found' });
		}

		const totalMarks = Number(markResult.rows[0].total_marks);
		const obtainedMarks = Number(marks_obtained);

		if (obtainedMarks > totalMarks) {
			return res.status(400).json({
				error: `Marks cannot be greater than total marks (${totalMarks})`
			});
		}

		await pool.query(
			`
			UPDATE marks
			SET marks_obtained = $1
			FROM students
			WHERE marks.roll_no = students.roll_no
			AND students.name = $2
			AND UPPER(TRIM(marks.test_code)) = UPPER(TRIM($3))
			`,
			[ obtainedMarks, name, test_code ]
		);

		res.json({ message: 'Marks updated' });
	} catch (err) {
		console.error('PUT /update-marks error:', err);
		res.status(500).json({ error: 'Update failed' });
	}
});

/* =========================================================
	ATTENDANCE FETCH / SAVE / UPDATE
	========================================================= */

function splitClassBoard(classBoard) {
	if (!classBoard) return { board: null, classOnly: null };

	const value = String(classBoard).trim();
	const lastDash = value.lastIndexOf('-');

	if (lastDash === -1) {
		return { board: null, classOnly: value };
	}

	return {
		board: value.slice(0, lastDash).trim(),
		classOnly: value.slice(lastDash + 1).trim()
	};
}

app.get('/classes', async (req, res) => {
	try {
		const result = await pool.query(`
				SELECT DISTINCT 
					TRIM(class) AS class,
					TRIM(board) AS board
				FROM students
				WHERE class IS NOT NULL
				AND board IS NOT NULL
				AND TRIM(class) <> ''
				AND TRIM(board) <> ''
				ORDER BY TRIM(board) ASC, TRIM(class) ASC
			`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /classes error:', err);
		res.status(500).json({ error: 'Failed to fetch classes' });
	}
});
/* =========================================================
	STUDENT RECORD REPORT - IG001 / IG002
	========================================================= */

app.get('/student-records', async (req, res) => {
	const { className, board } = req.query;

	if (!className || !board) {
		return res.status(400).json({
			error: 'className and board are required'
		});
	}

	try {
		const result = await pool.query(
			`
				SELECT
					roll_no,
					name,
					TRIM(class) AS class,
					TRIM(board) AS board,
					phone,
					email,
					school_name
				FROM students
				WHERE TRIM(class) = TRIM($1)
				AND TRIM(board) = TRIM($2)
				ORDER BY roll_no ASC
				`,
			[ className, board ]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /student-records error:', err);
		res.status(500).json({
			error: 'Failed to fetch student records',
			details: err.message
		});
	}
});

app.get('/student-record-report/:rollNo', async (req, res) => {
	const { rollNo } = req.params;

	try {
		const studentResult = await pool.query(
			`
				SELECT
					roll_no,
					name,
					TRIM(class) AS class,
					TRIM(board) AS board,
					mode_of_education,
					phone,
					email,
					school_name
				FROM students
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
				`,
			[ rollNo ]
		);

		if (studentResult.rows.length === 0) {
			return res.status(404).json({ error: 'Student not found' });
		}

	    const marksResult = await pool.query(
	`
		SELECT
			m.test_code,
			m.marks_obtained,
			COALESCE(m.total_marks, t.total_marks) AS total_marks,
			t.test_date,
			COALESCE(sub.subject_name, 
				CASE 
					WHEN t.subject_id = 1 THEN 'Maths'
					WHEN t.subject_id = 2 THEN 'Physics'
					ELSE 'Archived Test'
				END
			) AS subject_name
		FROM marks m
		LEFT JOIN tests t
			ON UPPER(TRIM(m.test_code)) = UPPER(TRIM(t.test_code))
		LEFT JOIN subjects sub
			ON t.subject_id = sub.subject_id
		WHERE UPPER(TRIM(m.roll_no)) = UPPER(TRIM($1))
		ORDER BY COALESCE(t.test_date, CURRENT_DATE) DESC, m.test_code DESC
		LIMIT 5
		`,
	[ rollNo ]
);

		const attendanceResult = await pool.query(
			`
				SELECT
					COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'present') AS present_days,
					COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'absent') AS absent_days
				FROM attendance
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
				`,
			[ rollNo ]
		);

		res.json({
			student: studentResult.rows[0],
			marks: marksResult.rows,
			attendance: {
				present_days: Number(attendanceResult.rows[0].present_days || 0),
				absent_days: Number(attendanceResult.rows[0].absent_days || 0)
			}
		});
	} catch (err) {
		console.error('GET /student-record-report/:rollNo error:', err);
		res.status(500).json({
			error: 'Failed to generate student report',
			details: err.message
		});
	}
});

app.get('/attendance', async (req, res) => {
	const { mode, class: classBoard, from, to, subject } = req.query;

	if (!mode) {
		return res.status(400).json({ error: 'mode is required' });
	}

	try {
		if (mode === 'report') {
			if (!classBoard || !from || !to) {
				return res.status(400).json({
					error: 'class, from and to are required'
				});
			}

			const { board, classOnly } = splitClassBoard(classBoard);

			if (!classOnly) {
				return res.status(400).json({ error: 'Invalid class selected' });
			}

			let query = `
					SELECT
						a.roll_no,
						s.name,
						TRIM(s.class) AS class,
						TRIM(s.board) AS board,
						a.subject_id,
						a.attendance_date,
						a.attendance_time,
						a.status,
						a.updated_by,
						a.marked_at,
						a.edited_by,
						a.edited_at
					FROM attendance a
					JOIN students s
					ON UPPER(TRIM(a.roll_no)) = UPPER(TRIM(s.roll_no))
					WHERE TRIM(s.class) = TRIM($1)
					AND a.attendance_date BETWEEN $2 AND $3
				`;

			const values = [ classOnly, from, to ];

			if (board) {
				values.push(board);
				query += ` AND TRIM(s.board) = TRIM($${values.length})`;
			}

			if (subject) {
				values.push(subject);
				query += ` AND a.subject_id = $${values.length}`;
			}

			query += `
					ORDER BY a.attendance_date DESC, a.attendance_time DESC, a.roll_no ASC
				`;

			const result = await pool.query(query, values);
			return res.json(result.rows);
		}

		if (mode === 'markedToday') {
			let query = `
					SELECT
						a.roll_no,
						s.name,
						TRIM(s.class) AS class,
						TRIM(s.board) AS board,
						a.subject_id,
						a.attendance_date,
						a.attendance_time,
						a.status,
						a.updated_by,
						a.marked_at,
						a.edited_by,
						a.edited_at
					FROM attendance a
					JOIN students s
					ON UPPER(TRIM(a.roll_no)) = UPPER(TRIM(s.roll_no))
					WHERE a.attendance_date = CURRENT_DATE
				`;

			const values = [];

			if (classBoard) {
				const { board, classOnly } = splitClassBoard(classBoard);

				if (classOnly) {
					values.push(classOnly);
					query += ` AND TRIM(s.class) = TRIM($${values.length})`;
				}

				if (board) {
					values.push(board);
					query += ` AND TRIM(s.board) = TRIM($${values.length})`;
				}
			}

			if (subject) {
				values.push(subject);
				query += ` AND a.subject_id = $${values.length}`;
			}

			query += `
					ORDER BY a.marked_at DESC, a.attendance_time DESC, a.roll_no ASC
				`;

			const result = await pool.query(query, values);
			return res.json(result.rows);
		}

		return res.status(400).json({ error: 'Invalid attendance mode' });
	} catch (err) {
		console.error('GET /attendance error:', err);
		res.status(500).json({
			error: 'Failed to fetch attendance',
			details: err.message
		});
	}
});

app.get('/attendance/:rollNo', async (req, res) => {
	const { rollNo } = req.params;

	try {
		const result = await pool.query(
			`
				SELECT 
					roll_no,
					subject_id,
					attendance_date,
					attendance_time,
					status,
					updated_by,
					marked_at,
					edited_by,
					edited_at
				FROM attendance
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
				ORDER BY attendance_date DESC, attendance_time DESC
				`,
			[ rollNo ]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /attendance/:rollNo error:', err);
		res.status(500).json({ error: 'Server error' });
	}
});

app.post('/attendance', async (req, res) => {
	const { records, subject, facultyId, overwrite = false } = req.body;
	const selectedDate = req.body.date || req.body.attendanceDate;

	if (!records || !Array.isArray(records) || records.length === 0) {
		return res.status(400).json({ error: 'records are required' });
	}

	const isSundayMode =
	!subject &&
	records.some((record) => record.subject_id);

if (!subject && !isSundayMode) {
	return res.status(400).json({ error: 'subject is required' });
}

	if (!facultyId) {
		return res.status(400).json({ error: 'facultyId is required' });
	}

	if (!selectedDate) {
		return res.status(400).json({ error: 'date is required' });
	}

	const client = await pool.connect();

	try {
		await client.query('BEGIN');

		let duplicateFound = false;
		const existingStudents = [];

		for (const record of records) {
			const actualSubject = subject || record.subject_id;
			const enrolledCheck = await client.query(
				`
				SELECT 1
				FROM student_subjects
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
				AND subject_id = $2
				LIMIT 1
				`,
				[record.roll_no, subject]
			);

			if (enrolledCheck.rows.length === 0) {
				await client.query('ROLLBACK');
				return res.status(400).json({
					error: `${record.roll_no} is not enrolled for selected subject`
				});
			}

			const exists = await client.query(
				`
				SELECT 1
				FROM attendance
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
				AND subject_id = $2
				AND attendance_date = $3
				`,
				[record.roll_no, subject, selectedDate]
			);

			if (exists.rows.length > 0) {
				duplicateFound = true;
				existingStudents.push(record.roll_no);

				if (overwrite) {
					await client.query(
						`
						UPDATE attendance
						SET status = $1,
							updated_by = $2,
							attendance_time = CURRENT_TIME,
							marked_at = COALESCE(marked_at, CURRENT_TIMESTAMP),
							edited_by = $2,
							edited_at = CURRENT_TIMESTAMP
						WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($3))
						AND subject_id = $4
						AND attendance_date = $5
						`,
						[record.status, facultyId, record.roll_no, subject, selectedDate]
					);
				}
			} else {
				await client.query(
					`
					INSERT INTO attendance
						(roll_no, subject_id, attendance_date, attendance_time, status, updated_by, marked_at)
					VALUES ($1, $2, $3, CURRENT_TIME, $4, $5, CURRENT_TIMESTAMP)
					`,
					[record.roll_no, subject, selectedDate, record.status, facultyId]
				);
			}
		}

		if (duplicateFound && !overwrite) {
			await client.query('ROLLBACK');

			return res.status(409).json({
				error: 'Attendance already marked for one or more students',
				duplicateFound: true,
				existingStudents
			});
		}

		for (const record of records) {
			await client.query(
				`
				INSERT INTO student_notifications
				(roll_no, module_name, message)
				VALUES ($1, $2, $3)
				`,
				[record.roll_no, 'attendance', 'Attendance updated']
			);
		}

		const attendanceTarget = await client.query(
			`
			SELECT s.class, s.board
			FROM students s
			WHERE UPPER(TRIM(s.roll_no)) = UPPER(TRIM($1))
			LIMIT 1
			`,
			[records[0].roll_no]
		);

		let notificationQueued = false;
		if (attendanceTarget.rows.length > 0) {
			const target = attendanceTarget.rows[0];
			const queued = await queueNotificationEvent(client, {
				eventKey: makeEventKey('attendance', selectedDate, subject, target.class, target.board),
				moduleName: 'attendance',
				className: target.class,
				board: target.board,
				subjectId: Number(subject),
				title: 'Attendance posted',
				message: `Attendance for ${selectedDate} has been posted`,
				payload: { attendance_date: selectedDate }
			});
			notificationQueued = queued.queued;
		}

		await client.query('COMMIT');

		res.json({
			message: overwrite ? 'Attendance overwritten successfully' : 'Attendance saved successfully',
			notificationQueued
		});
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('POST /attendance error:', err);
		res.status(500).json({
			error: 'Failed to save attendance',
			details: err.message
		});
	} finally {
		client.release();
	}
});
app.put('/attendance', async (req, res) => {
	const { records, subject, facultyId } = req.body;
	const selectedDate = req.body.date || req.body.attendanceDate;

	if (!records || !Array.isArray(records) || records.length === 0) {
		return res.status(400).json({ error: 'records are required' });
	}

	if (!subject || !facultyId || !selectedDate) {
		return res.status(400).json({
			error: 'subject, facultyId and date are required'
		});
	}

	const client = await pool.connect();

	try {
		await client.query('BEGIN');

		for (const record of records) {
			const enrolledCheck = await client.query(
				`
				SELECT 1
				FROM student_subjects
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
				AND subject_id = $2
				LIMIT 1
				`,
				[record.roll_no, subject]
			);

			if (enrolledCheck.rows.length === 0) {
				await client.query('ROLLBACK');

				return res.status(400).json({
					error: `${record.roll_no} is not enrolled for selected subject`
				});
			}

			const result = await client.query(
				`
				UPDATE attendance
				SET status = $1,
					edited_by = $2,
					edited_at = CURRENT_TIMESTAMP
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($3))
				AND subject_id = $4
				AND attendance_date = $5
				RETURNING *
				`,
				[record.status, facultyId, record.roll_no, subject, selectedDate]
			);

			if (result.rows.length === 0) {
				await client.query('ROLLBACK');

				return res.status(404).json({
					error: `Attendance record not found for ${record.roll_no}`
				});
			}
		}

		for (const record of records) {
			await client.query(
				`
				INSERT INTO student_notifications
				(roll_no, module_name, message)
				VALUES ($1, $2, $3)
				`,
				[record.roll_no, 'attendance', 'Attendance updated']
			);
		}

		await client.query('COMMIT');
		res.json({ message: 'Attendance updated successfully' });
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('PUT /attendance error:', err);
		res.status(500).json({
			error: 'Failed to update attendance',
			details: err.message
		});
	} finally {
		client.release();
	}
});
/* =========================================================
	POST TEST WITH SLOT LINK + DURATION + REGISTRATION DATES
	========================================================= */
// ================== GET ALL POSTED TESTS ==================
app.get('/tests', async (req, res) => {
	try {
		const result = await pool.query(`
				SELECT
    test_code,
    subject_id,
    CASE
        WHEN subject_id = 1 THEN 'Maths'
        WHEN subject_id = 2 THEN 'Physics'
        ELSE 'Unknown'
    END AS subject_name,
    test_date,
    total_marks,
    portion,
    chapter,
    created_by,
    TRIM(class) AS class,
    TRIM(board) AS board,
    duration_minutes,
    registration_end_date,
    writing_allowed_till
FROM tests
ORDER BY test_date DESC
			`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /tests error:', err);
		res.status(500).json({ error: 'Failed to fetch tests' });
	}
});

app.get('/posted-tests', async (req, res) => {
	try {
		const result = await pool.query(`
				SELECT
    test_code,
    subject_id,
    CASE
        WHEN subject_id = 1 THEN 'Maths'
        WHEN subject_id = 2 THEN 'Physics'
        ELSE 'Unknown'
    END AS subject_name,
    test_date,
    total_marks,
    portion,
    chapter,
    created_by,
    TRIM(class) AS class,
    TRIM(board) AS board,
    duration_minutes,
    registration_end_date,
    writing_allowed_till
FROM tests
ORDER BY test_date DESC
			`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /posted-tests error:', err);
		res.status(500).json({ error: 'Failed to fetch posted tests' });
	}
});

app.delete('/posted-tests/:testCode', async (req, res) => {
	const { testCode } = req.params;

	try {
		const result = await pool.query(
			`
				DELETE FROM tests
				WHERE UPPER(TRIM(test_code)) = UPPER(TRIM($1))
				RETURNING *
				`,
			[ testCode ]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Test not found' });
		}

		res.json({ message: 'Test deleted successfully' });
	} catch (err) {
		console.error('DELETE /posted-tests/:testCode error:', err);
		res.status(500).json({ error: 'Failed to delete test' });
	}
});
app.put('/posted-tests/:testCode', async (req, res) => {
	const { testCode } = req.params;

	try {
		const {
    subject_id,
    test_date,
    total_marks,
    portion,
    chapter,
    class_name,
    board,
    duration_minutes,
    registration_end_date,
    writing_allowed_till
} = req.body;

		if (
			!subject_id ||
			!test_date ||
			!total_marks ||
			!class_name ||
			!board
		) {
			return res.status(400).json({
				error: 'Required fields are missing'
			});
		}

		const existingTest = await pool.query(
			`
			SELECT test_code
			FROM tests
			WHERE UPPER(TRIM(test_code)) = UPPER(TRIM($1))
			`,
			[testCode]
		);

		if (existingTest.rows.length === 0) {
			return res.status(404).json({
				error: 'Test not found'
			});
		}

		if (registration_end_date) {
			const testDateObj = new Date(test_date);
			const regEndObj = new Date(registration_end_date);

			testDateObj.setHours(0, 0, 0, 0);
			regEndObj.setHours(0, 0, 0, 0);

			if (regEndObj >= testDateObj) {
				return res.status(400).json({
					error: 'Registration must end BEFORE test date'
				});
			}
		}

		const result = await pool.query(
			`
			UPDATE tests
			SET
    subject_id = $1,
    test_date = $2,
    total_marks = $3,
    portion = $4,
    chapter = $5,
    class = $6,
    board = $7,
    duration_minutes = $8,
    registration_end_date = $9,
    writing_allowed_till = $10
WHERE UPPER(TRIM(test_code)) = UPPER(TRIM($11))
			RETURNING *
			`,
	[
    subject_id,
    test_date,
    total_marks,
    portion || '',
    chapter || '',
    String(class_name).trim(),
    String(board).trim(),
    duration_minutes || null,
    registration_end_date || null,
    writing_allowed_till || null,
    testCode
]
		);

		res.json({
			message: 'Test updated successfully',
			test: result.rows[0]
		});
	} catch (err) {
		console.error('PUT /posted-tests/:testCode error:', err);

		res.status(500).json({
			error: 'Failed to update test',
			details: err.message
		});
	}
});
app.post('/post-test', async (req, res) => {
	const client = await pool.connect();

	try {
		await client.query('BEGIN');

		const {
			test_code,
			subject_id,
			test_date,
			total_marks,
			portion,
			 chapter,
			created_by,
			class_name,
			board,
			duration_minutes,
			registration_end_date,
			writing_allowed_till
		} = req.body;

		console.log('POST /post-test BODY:', req.body);

		if (!test_code || !subject_id || !test_date || !total_marks || !created_by || !class_name || !board) {
			await client.query('ROLLBACK');
			return res.status(400).json({
				error: 'Required fields are missing'
			});
		}

		if (registration_end_date) {
			const testDateObj = new Date(test_date);
			const regEndObj = new Date(registration_end_date);

			testDateObj.setHours(0, 0, 0, 0);
			regEndObj.setHours(0, 0, 0, 0);

			if (regEndObj >= testDateObj) {
				await client.query('ROLLBACK');
				return res.status(400).json({
					error: 'Registration must end BEFORE test date'
				});
			}
		}

		const cleanTestCode = String(test_code).trim().toUpperCase();
		const cleanClassName = String(class_name).trim();
		const cleanBoard = String(board).trim();

		const existingTest = await client.query(
			`
				SELECT test_code
				FROM tests
				WHERE UPPER(TRIM(test_code)) = UPPER(TRIM($1))
				`,
			[ cleanTestCode ]
		);

		if (existingTest.rows.length > 0) {
			await client.query('ROLLBACK');
			return res.status(400).json({
				error: 'Test code already exists'
			});
		}

		const insertResult = await client.query(
			`
	INSERT INTO tests (
  test_code,
  subject_id,
  test_date,
  total_marks,
  portion,
  chapter,
  created_by,
  class,
  board,
  duration_minutes,
  registration_end_date,
  writing_allowed_till
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
RETURNING *

				`,
			[
  cleanTestCode,
  subject_id,
  test_date,
  total_marks,
  portion || '',
  chapter || '',
  created_by,
  cleanClassName,
  cleanBoard,
  duration_minutes || null,
  registration_end_date || null,
  writing_allowed_till || null
]
		);
		const studentsForNotification = await client.query(
	`
	SELECT DISTINCT s.roll_no
	FROM students s
	JOIN student_subjects ss
		ON UPPER(TRIM(ss.roll_no)) = UPPER(TRIM(s.roll_no))
	WHERE TRIM(s.class) = TRIM($1)
	AND UPPER(TRIM(s.board)) = UPPER(TRIM($2))
	AND ss.subject_id = $3
	`,
	[cleanClassName, cleanBoard, Number(subject_id)]
);

		for (const student of studentsForNotification.rows) {
			await client.query(
				`
			INSERT INTO student_notifications
			(roll_no, module_name, message)
			VALUES ($1, $2, $3)
			`,
				[ student.roll_no, 'test-schedule', 'New test has been scheduled' ]
			);
		}

		const queued = await queueNotificationEvent(client, {
			eventKey: makeEventKey('test-schedule', cleanTestCode, cleanClassName, cleanBoard),
			moduleName: 'test-schedule',
			className: cleanClassName,
			board: cleanBoard,
			subjectId: Number(subject_id),
			title: 'New test scheduled',
			message: `Test ${cleanTestCode} has been scheduled`,
			payload: { test_code: cleanTestCode }
		});
		await client.query('COMMIT');
		res.json({
			message: 'Test posted successfully',
			test: insertResult.rows[0],
			notificationQueued: queued.queued
		});
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('POST /post-test error:', err);

		if (err.code === '23505') {
			return res.status(400).json({
				error: 'Test code already exists'
			});
		}

		res.status(500).json({
			error: 'Failed to create test',
			details: err.message
		});
	} finally {
		client.release();
	}
});
/* =========================================================
	FACULTY MANAGEMENT
	========================================================= */
app.get('/faculty', async (req, res) => {
	try {
		const result = await pool.query(`
			SELECT 
				f.faculty_id,
				f.name,
				f.role_id,
				fr.role_name,
				f.phone,
				f.email,
				f.password,
				f.employment_type,
				f.date_of_joining
			FROM faculty f
			LEFT JOIN faculty_roles fr ON f.role_id = fr.role_id
			ORDER BY f.faculty_id ASC
		`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /faculty error:', err);
		res.status(500).json({ error: 'Failed to fetch faculty list' });
	}
});

app.get('/faculty-roles', async (req, res) => {
	try {
		const result = await pool.query(`
			SELECT role_id, role_name
			FROM faculty_roles
			ORDER BY role_id ASC
		`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /faculty-roles error:', err);
		res.status(500).json({ error: 'Failed to fetch faculty roles' });
	}
});
app.get('/subjects', async (req, res) => {
	try {
		const result = await pool.query(`
			SELECT
				subject_id,
				subject_name
			FROM subjects
			ORDER BY subject_id ASC
		`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /subjects error:', err);

		res.status(500).json({
			error: 'Failed to fetch subjects',
			details: err.message
		});
	}
});

app.post('/faculty', async (req, res) => {
	const {
		faculty_id,
		name,
		role_id,
		phone,
		email,
		password,
		employment_type,
		date_of_joining
	} = req.body;

	if (
		!faculty_id ||
		!name ||
		!role_id ||
		!phone ||
		!email ||
		!password ||
		!employment_type ||
		!date_of_joining
	) {
		return res.status(400).json({ error: 'All fields are required' });
	}

	try {
		const existingFaculty = await pool.query(
			`SELECT faculty_id FROM faculty WHERE faculty_id = $1`,
			[faculty_id]
		);

		if (existingFaculty.rows.length > 0) {
			return res.status(400).json({ error: 'Faculty ID already exists' });
		}

		const roleCheck = await pool.query(
			`SELECT role_id FROM faculty_roles WHERE role_id = $1`,
			[role_id]
		);

		if (roleCheck.rows.length === 0) {
			return res.status(400).json({ error: 'Selected role does not exist' });
		}

		const result = await pool.query(
			`
			INSERT INTO faculty (
				faculty_id,
				name,
				role_id,
				phone,
				email,
				password,
				employment_type,
				date_of_joining
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
			RETURNING *
			`,
			[
				faculty_id,
				name,
				role_id,
				phone,
				email,
				password,
				employment_type,
				date_of_joining
			]
		);

		res.status(201).json({
			message: 'Faculty added successfully',
			faculty: result.rows[0]
		});
	} catch (err) {
		console.error('POST /faculty error:', err);

		if (err.code === '23505') {
			return res.status(400).json({ error: 'Duplicate faculty entry' });
		}

		res.status(500).json({ error: 'Failed to add faculty' });
	}
});

app.put('/faculty/:faculty_id', async (req, res) => {
	const { faculty_id } = req.params;

	const {
		name,
		role_id,
		phone,
		email,
		password,
		employment_type,
		date_of_joining
	} = req.body;

	if (!name || !role_id || !phone || !email || !employment_type || !date_of_joining) {
		return res.status(400).json({
			error: 'Name, role, phone, email, employment type and date of joining are required'
		});
	}

	try {
		const existingFaculty = await pool.query(
			`SELECT * FROM faculty WHERE faculty_id = $1`,
			[faculty_id]
		);

		if (existingFaculty.rows.length === 0) {
			return res.status(404).json({ error: 'Faculty not found' });
		}

		const roleCheck = await pool.query(
			`SELECT role_id FROM faculty_roles WHERE role_id = $1`,
			[role_id]
		);

		if (roleCheck.rows.length === 0) {
			return res.status(400).json({ error: 'Selected role does not exist' });
		}

		let result;

		if (password && password.trim() !== '') {
			result = await pool.query(
				`
				UPDATE faculty
				SET name = $1,
					role_id = $2,
					phone = $3,
					email = $4,
					password = $5,
					employment_type = $6,
					date_of_joining = $7
				WHERE faculty_id = $8
				RETURNING *
				`,
				[
					name,
					role_id,
					phone,
					email,
					password,
					employment_type,
					date_of_joining,
					faculty_id
				]
			);
		} else {
			result = await pool.query(
				`
				UPDATE faculty
				SET name = $1,
					role_id = $2,
					phone = $3,
					email = $4,
					employment_type = $5,
					date_of_joining = $6
				WHERE faculty_id = $7
				RETURNING *
				`,
				[
					name,
					role_id,
					phone,
					email,
					employment_type,
					date_of_joining,
					faculty_id
				]
			);
		}

		res.json({
			message: 'Faculty updated successfully',
			faculty: result.rows[0]
		});
	} catch (err) {
		console.error('PUT /faculty/:faculty_id error:', err);
		res.status(500).json({ error: 'Failed to update faculty' });
	}
});

app.delete('/faculty/:faculty_id', async (req, res) => {
	const { faculty_id } = req.params;

	const client = await pool.connect();

	try {
		await client.query('BEGIN');

		const existingFaculty = await client.query(
			`SELECT * FROM faculty WHERE faculty_id = $1`,
			[ faculty_id ]
		);

		if (existingFaculty.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Faculty not found' });
		}

		await client.query(
			`DELETE FROM faculty_notifications WHERE faculty_id = $1`,
			[ faculty_id ]
		);

		await client.query(
			`DELETE FROM faculty_tasks WHERE faculty_id = $1 OR assigned_by = $1`,
			[ faculty_id ]
		);

		await client.query(
			`DELETE FROM faculty WHERE faculty_id = $1`,
			[ faculty_id ]
		);

		await client.query('COMMIT');

		res.json({ message: 'Faculty deleted successfully' });
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('DELETE /faculty/:faculty_id error:', err);
		res.status(500).json({
			error: 'Failed to delete faculty',
			details: err.message
		});
	} finally {
		client.release();
	}
});
	
app.get('/students', async (req, res) => {
  const { class: className, board, subject_id } = req.query;

  try {
    let query = `
      SELECT DISTINCT
        s.roll_no,
        s.name,
        s.class,
        s.board,
        s.phone,
        s.email,
        s.school_name,
        s.password,
        s.mode_of_education
      FROM students s
      LEFT JOIN student_subjects ss
        ON UPPER(TRIM(ss.roll_no)) = UPPER(TRIM(s.roll_no))
      WHERE 1=1
    `;

    const values = [];

    if (className) {
      values.push(className);
      query += ` AND TRIM(s.class) = TRIM($${values.length})`;
    }

    if (board) {
      values.push(board);
      query += ` AND UPPER(TRIM(s.board)) = UPPER(TRIM($${values.length}))`;
    }

    if (subject_id) {
      values.push(Number(subject_id));
      query += ` AND ss.subject_id = $${values.length}`;
    }

    query += ` ORDER BY s.roll_no ASC`;

    const result = await pool.query(query, values);

    res.json(result.rows);
  } catch (err) {
    console.error('GET /students error:', err);

    res.status(500).json({
      error: 'Failed to fetch students'
    });
  }
});

app.get('/students-by-class/:class', async (req, res) => {
	const studentClass = req.params.class;

	try {
		const result = await pool.query(
			`
		SELECT roll_no, name
		FROM students
		WHERE class = $1
		ORDER BY roll_no ASC
		`,
			[ studentClass ]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /students-by-class/:class error:', err);
		res.status(500).json({ error: 'Database error' });
	}
});
app.get('/enter-marks-students', async (req, res) => {
	const { className, board, testCode } = req.query;

	if (!className || !board || !testCode) {
		return res.status(400).json({
			error: 'className, board and testCode are required'
		});
	}

	try {
		const testResult = await pool.query(
			`
			SELECT subject_id, TRIM(class) AS class, TRIM(board) AS board
			FROM tests
			WHERE UPPER(TRIM(test_code)) = UPPER(TRIM($1))
			`,
			[testCode]
		);

		if (testResult.rows.length === 0) {
			return res.status(404).json({ error: 'Test not found' });
		}

		const test = testResult.rows[0];

		if (
			String(test.class).trim() !== String(className).trim() ||
			String(test.board).trim().toUpperCase() !== String(board).trim().toUpperCase()
		) {
			return res.status(400).json({
				error: 'Selected test does not match selected class/board'
			});
		}

		const result = await pool.query(
			`
			SELECT DISTINCT
				s.roll_no,
				s.name,
				m.marks_obtained,
				m.comments,
				COALESCE(m.total_marks, t.total_marks) AS total_marks
			FROM students s
			JOIN student_subjects ss
				ON UPPER(TRIM(s.roll_no)) = UPPER(TRIM(ss.roll_no))
			JOIN tests t
				ON UPPER(TRIM(t.test_code)) = UPPER(TRIM($3))
			LEFT JOIN marks m
				ON UPPER(TRIM(m.roll_no)) = UPPER(TRIM(s.roll_no))
				AND UPPER(TRIM(m.test_code)) = UPPER(TRIM(t.test_code))
			WHERE TRIM(s.class) = TRIM($1)
			AND UPPER(TRIM(s.board)) = UPPER(TRIM($2))
			AND ss.subject_id = t.subject_id
			ORDER BY s.roll_no ASC
			`,
			[className, board, testCode]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /enter-marks-students error:', err);
		res.status(500).json({
			error: 'Failed to fetch students',
			details: err.message
		});
	}
});


/* =========================================================
	STUDENT FETCH ROUTES
========================================================= */

app.get('/students/:value', async (req, res) => {
	const { value } = req.params;
	const upperValue = String(value).toUpperCase();

	try {
		if (upperValue.startsWith('IA') || upperValue.startsWith('IG')) {
			const studentResult = await pool.query(
				`
			SELECT 
			s.roll_no,
			s.name,
			s.class,
			s.board,
			s.mode_of_education,
			s.phone,
			s.email,
			s.school_name,
			s.password,
			COALESCE(f.total_fee, 0) AS total_fee,
			COALESCE(f.fee_paid, 0) AS fee_paid,
			f.next_due
			FROM students s
			LEFT JOIN fees f ON s.roll_no = f.roll_no
			WHERE UPPER(TRIM(s.roll_no)) = UPPER(TRIM($1))
			`,
				[ upperValue ]
			);

			if (studentResult.rows.length === 0) {
				return res.status(404).json({ error: 'Student not found' });
			}

			const subjectsResult = await pool.query(
				`
			SELECT
			ss.subject_id,
			sub.subject_name
			FROM student_subjects ss
			JOIN subjects sub ON ss.subject_id = sub.subject_id
			WHERE UPPER(TRIM(ss.roll_no)) = UPPER(TRIM($1))
			ORDER BY ss.subject_id ASC
			`,
				[ upperValue ]
			);

			return res.json({
				...studentResult.rows[0],
				subjects: subjectsResult.rows
			});
		}

		const classResult = await pool.query(
			`
		SELECT roll_no, name
		FROM students
		WHERE class = $1
		ORDER BY roll_no ASC
		`,
			[ value ]
		);

		return res.json(classResult.rows);
	} catch (err) {
		console.error('GET /students/:value error:', err);
		res.status(500).json({
			error: 'Failed to fetch student data',
			details: err.message
		});
	}
});
async function generateNextStudentRollNo(client) {
	const result = await client.query(`
		SELECT roll_no
		FROM students
		WHERE UPPER(TRIM(roll_no)) LIKE 'IA%'
		ORDER BY CAST(REGEXP_REPLACE(roll_no, '\\D', '', 'g') AS INTEGER) DESC
		LIMIT 1
	`);

	if (result.rows.length === 0) {
		return 'IA001';
	}

	const lastRoll = String(result.rows[0].roll_no || '').toUpperCase().trim();
	const lastNumber = Number(lastRoll.replace('IA', ''));

	return `IA${String(lastNumber + 1).padStart(3, '0')}`;
}

app.post('/students', async (req, res) => {
	const client = await pool.connect();

	try {
		const {
			name,
			class: className,
			board,
			mode_of_education,
			phone,
			email,
			school_name,
			password,
			subject_ids,
			total_fee,
			fee_paid,
			next_due
		} = req.body;

		if (!name || !className || !board || !mode_of_education || !phone || !email || !school_name) {
			return res.status(400).json({
				error: 'All basic student fields are required'
			});
		}

		if (!Array.isArray(subject_ids) || subject_ids.length === 0) {
			return res.status(400).json({
				error: 'At least one subject must be selected'
			});
		}

		await client.query('BEGIN');

		const newRoll = await generateNextStudentRollNo(client);
		const finalPassword = password && String(password).trim() !== '' ? String(password).trim() : newRoll;

		await client.query(
			`
		INSERT INTO students (
			roll_no,
			name,
			class,
			board,
			mode_of_education,
			phone,
			email,
			school_name,
			password
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		`,
			[
				newRoll,
				String(name).trim(),
				String(className).trim(),
				String(board).trim(),
				String(mode_of_education).trim(),
				String(phone).trim(),
				String(email).trim(),
				String(school_name).trim(),
				finalPassword
			]
		);

		for (const subjectId of subject_ids) {
			const subjectCheck = await client.query(`SELECT subject_id FROM subjects WHERE subject_id = $1`, [
				subjectId
			]);

			if (subjectCheck.rows.length === 0) {
				await client.query('ROLLBACK');
				return res.status(400).json({
					error: `Subject ${subjectId} does not exist`
				});
			}

			await client.query(
				`
			INSERT INTO student_subjects (roll_no, subject_id)
			VALUES ($1,$2)
			`,
				[ newRoll, Number(subjectId) ]
			);
		}

		await client.query(
			`
		INSERT INTO fees (
			roll_no,
			total_fee,
			fee_paid,
			next_due
		)
		VALUES ($1,$2,$3,$4)
		`,
			[
				newRoll,
				total_fee === '' || total_fee === undefined || total_fee === null ? 0 : Number(total_fee),
				fee_paid === '' || fee_paid === undefined || fee_paid === null ? 0 : Number(fee_paid),
				next_due || null
			]
		);

		await client.query('COMMIT');

		res.status(201).json({
			message: 'Student added successfully',
			roll_no: newRoll
		});
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('POST /students error:', err);

		if (err.code === '23505') {
			return res.status(400).json({ error: 'Duplicate student entry' });
		}

		res.status(500).json({
			error: 'Failed to add student',
			details: err.message
		});
	} finally {
		client.release();
	}
});
app.put('/students/:roll_no', async (req, res) => {
	const client = await pool.connect();

	try {
		const oldRollNo = String(req.params.roll_no).trim().toUpperCase();

		const {
			roll_no,
			name,
			class: className,
			board,
			mode_of_education,
			phone,
			email,
			school_name,
			password,
			subject_ids,
			total_fee,
			fee_paid,
			next_due
		} = req.body;

		if (
			!roll_no ||
			!name ||
			!className ||
			!board ||
			!mode_of_education ||
			!phone ||
			!email ||
			!school_name ||
			!password
		) {
			return res.status(400).json({
				error: 'All basic student fields are required'
			});
		}

		if (!Array.isArray(subject_ids) || subject_ids.length === 0) {
			return res.status(400).json({
				error: 'At least one subject must be selected'
			});
		}

		await client.query('BEGIN');

		const existingStudent = await client.query(
			`SELECT * FROM students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`,
			[ oldRollNo ]
		);

		if (existingStudent.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Student not found' });
		}

		const newRollNo = String(roll_no).trim().toUpperCase();

		if (oldRollNo !== newRollNo) {
			const duplicateCheck = await client.query(
				`SELECT roll_no FROM students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`,
				[ newRollNo ]
			);

			if (duplicateCheck.rows.length > 0) {
				await client.query('ROLLBACK');
				return res.status(400).json({ error: 'New roll number already exists' });
			}

			await client.query(`UPDATE student_subjects SET roll_no = $1 WHERE roll_no = $2`, [ newRollNo, oldRollNo ]);
			await client.query(`UPDATE fees SET roll_no = $1 WHERE roll_no = $2`, [ newRollNo, oldRollNo ]);
			await client.query(`UPDATE attendance SET roll_no = $1 WHERE roll_no = $2`, [ newRollNo, oldRollNo ]);
			await client.query(`UPDATE marks SET roll_no = $1 WHERE roll_no = $2`, [ newRollNo, oldRollNo ]);
		}

		await client.query(
			`
		UPDATE students
		SET
			roll_no = $1,
			name = $2,
			class = $3,
			board = $4,
			mode_of_education = $5,
			phone = $6,
			email = $7,
			school_name = $8,
			password = $9
		WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($10))
		`,
			[
				newRollNo,
				String(name).trim(),
				String(className).trim(),
				String(board).trim(),
				String(mode_of_education).trim(),
				String(phone).trim(),
				String(email).trim(),
				String(school_name).trim(),
				String(password).trim(),
				oldRollNo
			]
		);

		await client.query(`DELETE FROM student_subjects WHERE roll_no = $1`, [ newRollNo ]);

		for (const subjectId of subject_ids) {
			const subjectCheck = await client.query(`SELECT subject_id FROM subjects WHERE subject_id = $1`, [
				subjectId
			]);

			if (subjectCheck.rows.length === 0) {
				await client.query('ROLLBACK');
				return res.status(400).json({
					error: `Subject ${subjectId} does not exist`
				});
			}

			await client.query(
				`
			INSERT INTO student_subjects (roll_no, subject_id)
			VALUES ($1,$2)
			`,
				[ newRollNo, Number(subjectId) ]
			);
		}

		const feeCheck = await client.query(`SELECT roll_no FROM fees WHERE roll_no = $1`, [ newRollNo ]);

		if (feeCheck.rows.length > 0) {
			await client.query(
				`
			UPDATE fees
			SET total_fee = $1,
				fee_paid = $2,
				next_due = $3
			WHERE roll_no = $4
			`,
				[
					total_fee === '' || total_fee === undefined || total_fee === null ? 0 : Number(total_fee),
					fee_paid === '' || fee_paid === undefined || fee_paid === null ? 0 : Number(fee_paid),
					next_due || null,
					newRollNo
				]
			);
		} else {
			await client.query(
				`
			INSERT INTO fees (
			roll_no,
			total_fee,
			fee_paid,
			next_due
			)
			VALUES ($1,$2,$3,$4)
			`,
				[
					newRollNo,
					total_fee === '' || total_fee === undefined || total_fee === null ? 0 : Number(total_fee),
					fee_paid === '' || fee_paid === undefined || fee_paid === null ? 0 : Number(fee_paid),
					next_due || null
				]
			);
		}

		await client.query('COMMIT');

		res.json({ message: 'Student updated successfully' });
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('PUT /students/:roll_no error:', err);
		res.status(500).json({
			error: 'Failed to update student',
			details: err.message
		});
	} finally {
		client.release();
	}
});

app.delete('/students/:roll_no', async (req, res) => {
	const client = await pool.connect();
	const { roll_no } = req.params;

	try {
		await client.query('BEGIN');

		const existingStudent = await client.query(
			`SELECT * FROM students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`,
			[ roll_no ]
		);

		if (existingStudent.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Student not found' });
		}

		await client.query(`DELETE FROM student_subjects WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [ roll_no ]);
		await client.query(`DELETE FROM fees WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [ roll_no ]);
		await client.query(`DELETE FROM attendance WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [ roll_no ]);
		await client.query(`DELETE FROM marks WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [ roll_no ]);
		await client.query(`DELETE FROM students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [ roll_no ]);

		await client.query('COMMIT');

		res.json({ message: 'Student deleted successfully' });
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('DELETE /students/:roll_no error:', err);
		res.status(500).json({
			error: 'Failed to delete student',
			details: err.message
		});
	} finally {
		client.release();
	}
});

app.get('/student-class-board-options', async (req, res) => {
	try {
		const result = await pool.query(`
		SELECT DISTINCT class, board
		FROM students
		ORDER BY board, class
		`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /student-class-board-options error:', err);
		res.status(500).json({ error: 'Failed to fetch class/board options' });
	}
});
/* =========================================================
	FACULTY TASKS
	========================================================= */

async function ensureDailyTasksForToday() {
	const today = new Date().toISOString().slice(0, 10);

	const templates = await pool.query(`
			SELECT *
			FROM faculty_tasks
			WHERE task_type = 'Daily'
			AND parent_daily_task_id IS NULL
		`);

	for (const template of templates.rows) {
		const existing = await pool.query(
			`
				SELECT id
				FROM faculty_tasks
				WHERE parent_daily_task_id = $1
				AND task_date = $2
				LIMIT 1
				`,
			[ template.id, today ]
		);

		if (existing.rows.length === 0) {
			await pool.query(
				`
					INSERT INTO faculty_tasks (
						faculty_id,
						faculty_name,
						class_name,
						subject_name,
						total_test_note,
						other_tasks,
						due_date,
						priority,
						assigned_by,
						task_type,
						parent_daily_task_id,
						task_date,
						is_completed,
						completed_at
					)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Daily',$10,$11,FALSE,NULL)
					`,
				[
					template.faculty_id,
					template.faculty_name,
					template.class_name,
					template.subject_name || '',
					template.total_test_note || '',
					template.other_tasks || '',
					today,
					template.priority || 'Medium',
					template.assigned_by,
					template.id,
					today
				]
			);
		}
	}
}

app.get('/faculty-tasks/:facultyId', async (req, res) => {
	const { facultyId } = req.params;

	try {
		await cleanupCompletedTasks();
		await ensureDailyTasksForToday();

		const result = await pool.query(
			`
				SELECT
					id,
					faculty_id,
					faculty_name,
					class_name,
					subject_name,
					total_test_note,
					other_tasks,
					due_date,
					priority,
					is_completed,
					completed_at,
					assigned_by,
					created_at,
					task_type,
					parent_daily_task_id,
					task_date
				FROM faculty_tasks
				WHERE faculty_id = $1
	AND (
		task_type = 'Weekly'
		OR task_type IS NULL
		OR (
		task_type = 'Daily'
		AND parent_daily_task_id IS NOT NULL
		AND is_completed = FALSE
		)
	)
				ORDER BY created_at DESC
				`,
			[ facultyId ]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /faculty-tasks/:facultyId error:', err);
		res.status(500).json({
			error: 'Failed to fetch faculty tasks',
			details: err.message
		});
	}
});

app.get('/faculty-tasks-all', async (req, res) => {
	const loginFacultyId = req.query.loginFacultyId;

	try {
		if (![ 'IG001', 'IG002' ].includes(loginFacultyId)) {
			return res.status(403).json({
				error: 'Only IG001 and IG002 can view all faculty tasks'
			});
		}

		await cleanupCompletedTasks();

		const result = await pool.query(`
				SELECT
					id,
					faculty_id,
					faculty_name,
					class_name,
					subject_name,
					total_test_note,
					other_tasks,
					due_date,
					priority,
					is_completed,
					completed_at,
					assigned_by,
					created_at,
					task_type,
					parent_daily_task_id,
					task_date
				FROM faculty_tasks
				WHERE task_type = 'Weekly'
				OR task_type IS NULL
				ORDER BY created_at DESC
			`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /faculty-tasks-all error:', err);
		res.status(500).json({
			error: 'Failed to fetch all faculty tasks',
			details: err.message
		});
	}
});

app.get('/faculty-daily-tasks-all', async (req, res) => {
	const loginFacultyId = req.query.loginFacultyId;

	try {
		if (![ 'IG001', 'IG002' ].includes(loginFacultyId)) {
			return res.status(403).json({
				error: 'Only IG001 and IG002 can view all faculty daily tasks'
			});
		}

		await ensureDailyTasksForToday();

		const today = new Date().toISOString().slice(0, 10);

		const result = await pool.query(
			`
				SELECT
					id,
					faculty_id,
					faculty_name,
					class_name,
					subject_name,
					total_test_note,
					other_tasks,
					due_date,
					priority,
					is_completed,
					completed_at,
					assigned_by,
					created_at,
					task_type,
					parent_daily_task_id,
					task_date
				FROM faculty_tasks
				WHERE task_type = 'Daily'
				AND parent_daily_task_id IS NOT NULL
				AND task_date = $1
				ORDER BY faculty_id ASC, created_at DESC
				`,
			[ today ]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /faculty-daily-tasks-all error:', err);
		res.status(500).json({
			error: 'Failed to fetch daily tasks',
			details: err.message
		});
	}
});

app.post('/faculty-tasks', async (req, res) => {
	const {
		loginFacultyId,
		faculty_id,
		faculty_name,
		class_name,
		subject_name,
		total_test_note,
		other_tasks,
		due_date,
		priority,
		task_type
	} = req.body;

	try {
		if (!faculty_id || !faculty_name || !class_name) {
			return res.status(400).json({
				error: 'Faculty Name and Class are required'
			});
		}

		if (!subject_name && !other_tasks) {
			return res.status(400).json({
				error: 'Please select Test Code or enter Other Tasks'
			});
		}

		if (![ 'IG001', 'IG002' ].includes(loginFacultyId)) {
			return res.status(403).json({
				error: 'Only IG001 and IG002 can assign tasks'
			});
		}

		const finalTaskType = task_type === 'Daily' ? 'Daily' : 'Weekly';
		const today = new Date().toISOString().slice(0, 10);

		// =========================================================
		// DAILY TASK
		// =========================================================

		if (finalTaskType === 'Daily') {
			const templateResult = await pool.query(
				`
					INSERT INTO faculty_tasks (
						faculty_id,
						faculty_name,
						class_name,
						subject_name,
						total_test_note,
						other_tasks,
						due_date,
						priority,
						assigned_by,
						task_type,
						parent_daily_task_id,
						task_date
					)
					VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,'Daily',NULL,NULL)
					RETURNING *
				`,
				[
					faculty_id,
					faculty_name,
					class_name,
					subject_name || '',
					total_test_note || '',
					other_tasks || '',
					priority || 'Medium',
					loginFacultyId
				]
			);

			const template = templateResult.rows[0];

			const todayTaskResult = await pool.query(
				`
					INSERT INTO faculty_tasks (
						faculty_id,
						faculty_name,
						class_name,
						subject_name,
						total_test_note,
						other_tasks,
						due_date,
						priority,
						assigned_by,
						task_type,
						parent_daily_task_id,
						task_date,
						is_completed,
						completed_at
					)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Daily',$10,$11,FALSE,NULL)
					RETURNING *
				`,
				[
					faculty_id,
					faculty_name,
					class_name,
					subject_name || '',
					total_test_note || '',
					other_tasks || '',
					today,
					priority || 'Medium',
					loginFacultyId,
					template.id,
					today
				]
			);

			// Create in-app notification and send Firebase push notification
			await createFacultyNotification(pool, {
				facultyId: faculty_id,
				moduleName: 'tasks',
				message: 'New task assigned by admin'
			});

			return res.json({
				message: 'Daily task assigned successfully',
				task: todayTaskResult.rows[0]
			});
		}

		// =========================================================
		// WEEKLY TASK
		// =========================================================

		const result = await pool.query(
			`
				INSERT INTO faculty_tasks (
					faculty_id,
					faculty_name,
					class_name,
					subject_name,
					total_test_note,
					other_tasks,
					due_date,
					priority,
					assigned_by,
					task_type,
					parent_daily_task_id,
					task_date
				)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Weekly',NULL,NULL)
				RETURNING *
			`,
			[
				faculty_id,
				faculty_name,
				class_name,
				subject_name || '',
				total_test_note || '',
				other_tasks || '',
				due_date || null,
				priority || 'Medium',
				loginFacultyId
			]
		);

		// Create in-app notification and send Firebase push notification
		await createFacultyNotification(pool, {
			facultyId: faculty_id,
			moduleName: 'tasks',
			message: 'New task assigned by admin'
		});

		return res.json({
			message: 'Task assigned successfully',
			task: result.rows[0]
		});
	} catch (err) {
		console.error('POST /faculty-tasks error:', err);

		res.status(500).json({
			error: 'Failed to assign task',
			details: err.message
		});
	}
});


app.put('/faculty-tasks/:id', async (req, res) => {
	const { id } = req.params;
	const { is_completed, faculty_id, faculty_name } = req.body;

	try {
		let result;

		if (faculty_id && faculty_name) {
			result = await pool.query(
				`
					UPDATE faculty_tasks
					SET faculty_id = $1,
						faculty_name = $2,
						is_completed = FALSE,
						completed_at = NULL
					WHERE id = $3
					RETURNING *
				`,
				[ faculty_id, faculty_name, id ]
			);
		} else if (typeof is_completed === 'boolean') {
			result = await pool.query(
				`
					UPDATE faculty_tasks
					SET is_completed = $1,
						completed_at = CASE
							WHEN $1 = TRUE THEN CURRENT_TIMESTAMP
							ELSE NULL
						END
					WHERE id = $2
					RETURNING *
				`,
				[ is_completed, id ]
			);
		} else {
			return res.status(400).json({
				error: 'No valid update data provided'
			});
		}

		if (result.rowCount === 0) {
			return res.status(404).json({
				error: 'Task not found'
			});
		}

		const updatedTask = result.rows[0];

		if (updatedTask.is_completed === true) {
			const moduleName =
				updatedTask.task_type === 'Daily'
					? 'daily-tasks'
					: 'all-tasks';

			const message =
				updatedTask.task_type === 'Daily'
					? `${updatedTask.faculty_name} completed a daily task`
					: `${updatedTask.faculty_name} completed a weekly task`;

			await pool.query(
				`
					INSERT INTO faculty_notifications
					(faculty_id, module_name, message)
					VALUES ($1, $2, $3), ($4, $5, $6)
				`,
				[
					'IG001',
					moduleName,
					message,
					'IG002',
					moduleName,
					message
				]
			);
		}

		res.json(updatedTask);
	} catch (err) {
		console.error('PUT /faculty-tasks/:id error:', err);

		res.status(500).json({
			error: 'Failed to update task',
			details: err.message
		});
	}
});


app.delete('/faculty-tasks/:id', async (req, res) => {
	const { id } = req.params;
	const loginFacultyId = req.query.loginFacultyId;

	try {
		if (![ 'IG001', 'IG002' ].includes(loginFacultyId)) {
			return res.status(403).json({
				error: 'Only IG001 and IG002 can delete faculty tasks'
			});
		}

		const taskResult = await pool.query(
			`
				SELECT id, parent_daily_task_id, task_type
				FROM faculty_tasks
				WHERE id = $1
			`,
			[ id ]
		);

		if (taskResult.rows.length === 0) {
			return res.status(404).json({
				error: 'Task not found'
			});
		}

		const task = taskResult.rows[0];

		const deleteId = task.parent_daily_task_id
			? task.parent_daily_task_id
			: task.id;

		const result = await pool.query(
			`
				DELETE FROM faculty_tasks
				WHERE id = $1
				   OR parent_daily_task_id = $1
				RETURNING *
			`,
			[ deleteId ]
		);

		res.json({
			message: 'Task deleted successfully',
			deletedCount: result.rowCount
		});
	} catch (err) {
		console.error('DELETE /faculty-tasks/:id error:', err);

		res.status(500).json({
			error: 'Failed to delete task',
			details: err.message
		});
	}
});

/* =========================================================
	ENQUIRIES
	========================================================= */
app.put('/enquiries/:id', async (req, res) => {
	const { id } = req.params;
	const { status, comment, reason } = req.body;

	try {
		const result = await pool.query(
			`
		UPDATE enquiries
		SET status = $1,
			comment = $2,
			reason = $3
		WHERE id = $4
		RETURNING *
		`,
			[ status || 'Pending', comment || null, reason || null, id ]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({
				success: false,
				error: 'Enquiry not found'
			});
		}

		res.json({
			success: true,
			message: 'Enquiry updated successfully',
			enquiry: result.rows[0]
		});
	} catch (err) {
		console.error('PUT /enquiries/:id error:', err);
		res.status(500).json({
			success: false,
			error: 'Failed to update enquiry'
		});
	}
});

app.delete('/enquiries/:id', async (req, res) => {
	const { id } = req.params;

	try {
		const result = await pool.query(
			`
		DELETE FROM enquiries
		WHERE id = $1
		RETURNING *
		`,
			[ id ]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({
				success: false,
				error: 'Enquiry not found'
			});
		}

		res.json({
			success: true,
			message: 'Enquiry deleted successfully',
			deleted: result.rows[0]
		});
	} catch (err) {
		console.error('DELETE /enquiries/:id error:', err);
		res.status(500).json({
			success: false,
			error: 'Failed to delete enquiry',
			details: err.message
		});
	}
});

app.post('/enquiries', async (req, res) => {
	try {
		const {
			studentName,
			classBoard,
			schoolName,
			subjects,
			academicYearFrom,
			academicYearTo,
			modeOfEducation,
			parentName,
			mobileNumber,
			secondaryContact,
			area,
			reference
		} = req.body;

		const cleanMobile = String(mobileNumber || '').replace(/\D/g, '').trim();
		const cleanSecondary = String(secondaryContact || '').replace(/\D/g, '').trim();
		const cleanAcademicYearFrom = String(academicYearFrom || '').replace(/\D/g, '').trim();
		const cleanAcademicYearTo = String(academicYearTo || '').replace(/\D/g, '').trim();

		if (!/^\d{4}$/.test(cleanAcademicYearFrom)) {
			return res.status(400).json({
				message: 'Academic Year From must contain 4 digits'
			});
		}

		if (!/^\d{4}$/.test(cleanAcademicYearTo)) {
			return res.status(400).json({
				message: 'Academic Year To must contain 4 digits'
			});
		}

		if (Number(cleanAcademicYearTo) <= Number(cleanAcademicYearFrom)) {
			return res.status(400).json({
				message: 'Academic Year To must be greater than From'
			});
		}

		if (!/^\d{10}$/.test(cleanMobile)) {
			return res.status(400).json({
				message: 'Phone number must contain exactly 10 digits'
			});
		}

		if (!cleanSecondary) {
			return res.status(400).json({
				message: 'Secondary contact is required'
			});
		}

		if (!/^\d{10}$/.test(cleanSecondary)) {
			return res.status(400).json({
				message: 'Secondary contact must contain exactly 10 digits'
			});
		}

		if (cleanMobile === cleanSecondary) {
			return res.status(400).json({
				message: 'Primary and Secondary contact numbers cannot be the same'
			});
		}

		const result = await pool.query(
			`
		INSERT INTO enquiries
		(
			student_name,
			mobile_number,
			class_board,
			school_name,
			subjects,
			academic_year_from,
			academic_year_to,
			parent_name,
			secondary_contact,
			area,
			mode_of_education,
			reference
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING *
		`,
			[
				studentName,
				cleanMobile,
				classBoard,
				schoolName,
				subjects,
				cleanAcademicYearFrom,
				cleanAcademicYearTo,
				parentName,
				cleanSecondary,
				area,
				modeOfEducation,
				reference || null
			]
		);

		res.status(201).json(result.rows[0]);
	} catch (err) {
		console.error('POST /enquiries error:', err);
		res.status(500).json({ message: 'Failed to submit enquiry' });
	}
});

app.get('/enquiries', async (req, res) => {
	try {
		const result = await pool.query(`
		SELECT
			enq_id,
			id,
			student_name,
			mobile_number,
			class_board,
			school_name,
			subjects,
			academic_year_from,
			academic_year_to,
			mode_of_education,
			parent_name,
			secondary_contact,
			created_at,
			status,
			comment,
			reason,
			area,
			reference
		FROM enquiries
		ORDER BY created_at DESC
		`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /enquiries error:', err);
		res.status(500).json({ error: err.message });
	}
});
/* =========================================================
	ANSWER SHEET REQUESTS
	========================================================= */
app.get('/student-answer-sheet-data/:rollNo', async (req, res) => {
	const { rollNo } = req.params;

	try {
		const studentResult = await pool.query(
			`
		SELECT roll_no, name, class, board
		FROM students
		WHERE roll_no = $1
		`,
			[ rollNo ]
		);

		if (studentResult.rows.length === 0) {
			return res.status(404).json({ error: 'Student not found' });
		}

		const student = studentResult.rows[0];

		const testsResult = await pool.query(
			`
		SELECT test_code, test_date, subject_id, total_marks, portion
		FROM tests
		WHERE class = $1 AND board = $2
		ORDER BY test_date DESC, test_code ASC
		`,
			[ student.class, student.board ]
		);

		res.json({
			student,
			tests: testsResult.rows
		});
	} catch (error) {
		console.error('GET /student-answer-sheet-data/:rollNo error:', error);
		res.status(500).json({
			error: 'Server error while fetching data'
		});
	}
});

app.post('/answer-sheet-requests', async (req, res) => {
	const { roll_no, test_code, requested_phone } = req.body;

	try {
		if (!roll_no || !test_code || !requested_phone) {
			return res.status(400).json({
				error: 'roll_no, test_code and requested_phone are required'
			});
		}

		const cleanPhone = String(requested_phone).replace(/\D/g, '').trim();

		if (!/^\d{10}$/.test(cleanPhone)) {
			return res.status(400).json({
				error: 'Phone number must contain exactly 10 digits'
			});
		}

		const studentResult = await pool.query(
			`
		SELECT roll_no, name, class, board
		FROM students
		WHERE roll_no = $1
		`,
			[ roll_no ]
		);

		if (studentResult.rows.length === 0) {
			return res.status(404).json({ error: 'Student not found' });
		}

		const student = studentResult.rows[0];

		const validTestResult = await pool.query(
			`
		SELECT test_code
		FROM tests
		WHERE test_code = $1
			AND class = $2
			AND board = $3
		`,
			[ test_code, student.class, student.board ]
		);

		if (validTestResult.rows.length === 0) {
			return res.status(400).json({
				error: 'Selected test code is not valid for this student'
			});
		}

		const duplicateResult = await pool.query(
			`
		SELECT id
		FROM answer_sheet_requests
		WHERE roll_no = $1
			AND test_code = $2
			AND status = 'Pending'
		`,
			[ roll_no, test_code ]
		);

		if (duplicateResult.rows.length > 0) {
			return res.status(400).json({
				error: 'You already have a pending request for this test code'
			});
		}

		const insertResult = await pool.query(
			`
		INSERT INTO answer_sheet_requests
		(
			roll_no,
			student_name,
			class_name,
			board,
			test_code,
			requested_phone,
			status
		)
		VALUES ($1,$2,$3,$4,$5,$6,'Pending')
		RETURNING *
		`,
			[ student.roll_no, student.name, student.class, student.board, test_code, cleanPhone ]
		);

		res.status(201).json({
			message: 'Answer sheet request submitted successfully',
			request: insertResult.rows[0]
		});
	} catch (error) {
		console.error('POST /answer-sheet-requests error:', error);
		res.status(500).json({
			error: 'Server error while saving request'
		});
	}
});

app.get('/answer-sheet-requests', async (req, res) => {
	try {
		const result = await pool.query(`
		SELECT *
		FROM answer_sheet_requests
		ORDER BY requested_at DESC
		`);

		res.json(result.rows);
	} catch (error) {
		console.error('GET /answer-sheet-requests error:', error);
		res.status(500).json({
			error: 'Server error while fetching requests',
			details: error.message
		});
	}
});

app.put('/answer-sheet-requests/:id', async (req, res) => {
	const { id } = req.params;
	const { status } = req.body;

	try {
		if (!status) {
			return res.status(400).json({ error: 'status is required' });
		}

		const result = await pool.query(
			`
		UPDATE answer_sheet_requests
		SET status = $1
		WHERE id = $2
		RETURNING *
		`,
			[ status, id ]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Request not found' });
		}

		res.json({
			message: 'Request updated successfully',
			request: result.rows[0]
		});
	} catch (error) {
		console.error('PUT /answer-sheet-requests/:id error:', error);
		res.status(500).json({
			error: 'Server error while updating request'
		});
	}
});

app.delete('/answer-sheet-requests/:id', async (req, res) => {
	const { id } = req.params;

	try {
		const result = await pool.query(
			`
		DELETE FROM answer_sheet_requests
		WHERE id = $1
		RETURNING *
		`,
			[ id ]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Request not found' });
		}

		res.json({
			message: 'Request completed and deleted successfully',
			deletedRequest: result.rows[0]
		});
	} catch (error) {
		console.error('DELETE /answer-sheet-requests/:id error:', error);
		res.status(500).json({
			error: 'Server error while deleting request',
			details: error.message
		});
	}
});

/* =========================================================
	REGISTERED STUDENTS REPORT
	========================================================= */

	app.get('/registered-students', async (req, res) => {
	const { className, board, date } = req.query;

	try {
		await pool.query(`
			DELETE FROM test_registrations
			WHERE test_date < CURRENT_DATE
		`);

		let query = `
			SELECT
				tr.id,
				tr.roll_no,
				tr.student_name,
				TRIM(tr.class) AS class,
				TRIM(tr.board) AS board,
				tr.test_code,
				TO_CHAR(tr.test_date, 'YYYY-MM-DD') AS test_date,
				TO_CHAR(tr.writing_date, 'YYYY-MM-DD') AS writing_date,
				tr.slot_start,
				tr.slot_end,
				tr.duration_minutes,
				COALESCE(s.subject_name, 'Unknown') AS subject_name
			FROM test_registrations tr
			LEFT JOIN subjects s
				ON tr.subject_id = s.subject_id
			WHERE 1=1
		`;

		const values = [];
		let index = 1;

		if (className) {
			query += ` AND TRIM(tr.class) = TRIM($${index})`;
			values.push(className);
			index++;
		}

		if (board) {
			query += ` AND UPPER(TRIM(tr.board)) = UPPER(TRIM($${index}))`;
			values.push(board);
			index++;
		}

		if (date) {
			query += ` AND tr.test_date = $${index}`;
			values.push(date);
			index++;
		}

		query += `
			ORDER BY
				tr.test_date ASC,
				tr.writing_date ASC NULLS LAST,
				tr.class ASC,
				tr.roll_no ASC
		`;

		const result = await pool.query(query, values);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /registered-students error:', err);
		res.status(500).json({
			error: 'Failed to fetch registered students',
			details: err.message
		});
	}
});
app.put('/posted-tests/:testCode', async (req, res) => {
	const { testCode } = req.params;

	const {
		test_code,
		subject_id,
		test_date,
		total_marks,
		portion,
		class_name,
		board,
		duration_minutes,
		registration_end_date,
		writing_allowed_till
	} = req.body;

	try {
		const result = await pool.query(
			`
UPDATE tests
SET
    subject_id = $1,
    test_date = $2,
    total_marks = $3,
    portion = $4,
    chapter = $5,
    class = $6,
    board = $7,
    duration_minutes = $8,
    registration_end_date = $9,
    writing_allowed_till = $10
WHERE UPPER(TRIM(test_code)) = UPPER(TRIM($11))
RETURNING *
      `,
			[
				subject_id,
				test_date,
				total_marks,
				portion,
				class_name,
				board,
				duration_minutes,
				registration_end_date,
				writing_allowed_till,
				testCode
			]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Test not found' });
		}

		res.json({ message: 'Test updated successfully', test: result.rows[0] });
	} catch (err) {
		console.error('PUT /posted-tests/:testCode error:', err);
		res.status(500).json({ error: 'Failed to update test' });
	}
});
app.get('/faculty-roles', async (req, res) => {
	try {
		const result = await pool.query(`
			SELECT role_id, role_name
			FROM faculty_roles
			ORDER BY role_id ASC
		`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /faculty-roles error:', err);
		res.status(500).json({ error: 'Failed to fetch faculty roles' });
	}
});
app.get('/attendance-students', async (req, res) => {
  const {
    date,
    class: className,
    board,
    subject_id
  } = req.query;

  if (!date) {
    return res.status(400).json({
      error: 'date is required'
    });
  }

  try {
    const dayOfWeek = new Date(date).getDay();

    // ==========================
    // SUNDAY MODE
    // ==========================
    if (dayOfWeek === 0) {
      const result = await pool.query(
        `
        SELECT
          roll_no,
          student_name AS name,
          class,
          board,
          subject_id,
          test_code
        FROM test_registrations
        WHERE writing_date = $1
        ORDER BY class, subject_id, roll_no
        `,
        [date]
      );

      return res.json({
        mode: 'sunday',
        students: result.rows
      });
    }

    // ==========================
    // WEEKDAY MODE
    // ==========================
    if (!className || !board || !subject_id) {
      return res.status(400).json({
        error: 'class, board and subject_id are required'
      });
    }

    const testCheck = await pool.query(
      `
      SELECT 1
      FROM tests
      WHERE test_date = $1
        AND TRIM(class) = TRIM($2)
        AND UPPER(TRIM(board)) = UPPER(TRIM($3))
        AND subject_id = $4
      LIMIT 1
      `,
      [date, className, board, Number(subject_id)]
    );

    // ==========================
    // TEST EXISTS
    // ==========================
    if (testCheck.rows.length > 0) {
      const registrations = await pool.query(
        `
        SELECT
          roll_no,
          student_name AS name,
          class,
          board,
          subject_id,
          test_code
        FROM test_registrations
        WHERE writing_date = $1
          AND TRIM(class) = TRIM($2)
          AND UPPER(TRIM(board)) = UPPER(TRIM($3))
          AND subject_id = $4
        ORDER BY roll_no
        `,
        [date, className, board, Number(subject_id)]
      );

      return res.json({
        mode: 'test',
        students: registrations.rows
      });
    }

    // ==========================
    // NORMAL ATTENDANCE
    // ==========================
    const students = await pool.query(
      `
      SELECT DISTINCT
        s.roll_no,
        s.name,
        s.class,
        s.board,
        s.phone,
        s.email,
        s.school_name,
        s.password,
        s.mode_of_education
      FROM students s
      INNER JOIN student_subjects ss
        ON UPPER(TRIM(ss.roll_no)) = UPPER(TRIM(s.roll_no))
      WHERE TRIM(s.class) = TRIM($1)
        AND UPPER(TRIM(s.board)) = UPPER(TRIM($2))
        AND ss.subject_id = $3
      ORDER BY s.roll_no ASC
      `,
      [className, board, Number(subject_id)]
    );

    return res.json({
      mode: 'normal',
      students: students.rows
    });

  } catch (err) {
    console.error('GET /attendance-students error:', err);

    return res.status(500).json({
      error: 'Failed to load attendance students',
      details: err.message
    });
  }
});
app.delete('/syllabus/:id', async (req, res) => {
  try {
    const syllabusId = Number(req.params.id);

    if (!Number.isInteger(syllabusId) || syllabusId <= 0) {
      return res.status(400).json({
        error: 'Invalid syllabus ID'
      });
    }

    const result = await pool.query(
      `
      DELETE FROM syllabus
      WHERE syllabus_id = $1
      RETURNING *
      `,
      [syllabusId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Syllabus chapter not found'
      });
    }

    res.json({
      message: 'Syllabus chapter deleted successfully',
      syllabus: result.rows[0]
    });

  } catch (err) {
    console.error('DELETE /syllabus/:id error:', err);

    res.status(500).json({
      error: 'Failed to delete syllabus',
      details: err.message
    });
  }
});
app.put('/syllabus/:id', async (req, res) => {
  try {
    const syllabusId = Number(req.params.id);

    const {
      class: className,
      board,
      subject_id,
      chapter_no,
      chapter_name
    } = req.body;

    console.log(
      'PUT /syllabus BODY:',
      req.params.id,
      req.body
    );

    // -----------------------------
    // Validate ID
    // -----------------------------

    if (!Number.isInteger(syllabusId) || syllabusId <= 0) {
      return res.status(400).json({
        error: 'Invalid syllabus ID'
      });
    }

    // -----------------------------
    // Validate fields
    // -----------------------------

    if (
      !className ||
      !board ||
      !subject_id ||
      !chapter_no ||
      !chapter_name
    ) {
      return res.status(400).json({
        error: 'Required fields are missing'
      });
    }

    const cleanClass = String(className).trim();
    const cleanBoard = String(board).trim();
    const cleanChapterName = String(chapter_name).trim();

    const subjectId = Number(subject_id);
    const chapterNo = Number(chapter_no);

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      return res.status(400).json({
        error: 'Invalid subject'
      });
    }

    if (!Number.isInteger(chapterNo) || chapterNo <= 0) {
      return res.status(400).json({
        error: 'Invalid chapter number'
      });
    }

    if (!cleanChapterName) {
      return res.status(400).json({
        error: 'Chapter name is required'
      });
    }

    // -----------------------------
    // Check record exists
    // -----------------------------

    const existing = await pool.query(
      `
      SELECT syllabus_id
      FROM syllabus
      WHERE syllabus_id = $1
      `,
      [syllabusId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'Syllabus chapter not found'
      });
    }

    // -----------------------------
    // Check duplicate
    // -----------------------------

    const duplicate = await pool.query(
      `
      SELECT syllabus_id
      FROM syllabus
      WHERE LOWER(TRIM(class)) = LOWER(TRIM($1))
        AND LOWER(TRIM(board)) = LOWER(TRIM($2))
        AND subject_id = $3
        AND chapter_no = $4
        AND syllabus_id <> $5
      `,
      [
        cleanClass,
        cleanBoard,
        subjectId,
        chapterNo,
        syllabusId
      ]
    );

    if (duplicate.rows.length > 0) {
      return res.status(400).json({
        error: 'Another syllabus chapter already uses this chapter number'
      });
    }

    // -----------------------------
    // Update
    // -----------------------------

    const result = await pool.query(
      `
      UPDATE syllabus
      SET
        class = $1,
        board = $2,
        subject_id = $3,
        chapter_no = $4,
        chapter_name = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE syllabus_id = $6
      RETURNING *
      `,
      [
        cleanClass,
        cleanBoard,
        subjectId,
        chapterNo,
        cleanChapterName,
        syllabusId
      ]
    );

    res.json({
      message: 'Syllabus chapter updated successfully',
      syllabus: result.rows[0]
    });

  } catch (err) {
    console.error('PUT /syllabus/:id error:', err);

    if (err.code === '23505') {
      return res.status(400).json({
        error: 'This chapter already exists for this subject'
      });
    }

    if (err.code === '23503') {
      return res.status(400).json({
        error: 'Invalid subject'
      });
    }

    res.status(500).json({
      error: 'Failed to update syllabus',
      details: err.message
    });
  }
});
app.post('/syllabus', async (req, res) => {
  try {
    const {
      class: className,
      board,
      subject_id,
      chapter_no,
      chapter_name
    } = req.body;

    console.log('POST /syllabus BODY:', req.body);

    // -----------------------------
    // Validation
    // -----------------------------

    if (
      !className ||
      !board ||
      !subject_id ||
      !chapter_no ||
      !chapter_name
    ) {
      return res.status(400).json({
        error: 'Required fields are missing'
      });
    }

    const cleanClass = String(className).trim();
    const cleanBoard = String(board).trim();
    const cleanChapterName = String(chapter_name).trim();

    const subjectId = Number(subject_id);
    const chapterNo = Number(chapter_no);

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      return res.status(400).json({
        error: 'Invalid subject'
      });
    }

    if (!Number.isInteger(chapterNo) || chapterNo <= 0) {
      return res.status(400).json({
        error: 'Invalid chapter number'
      });
    }

    if (!cleanChapterName) {
      return res.status(400).json({
        error: 'Chapter name is required'
      });
    }

    // -----------------------------
    // Check duplicate
    // -----------------------------

    const existing = await pool.query(
      `
      SELECT syllabus_id
      FROM syllabus
      WHERE LOWER(TRIM(class)) = LOWER(TRIM($1))
        AND LOWER(TRIM(board)) = LOWER(TRIM($2))
        AND subject_id = $3
        AND chapter_no = $4
      `,
      [
        cleanClass,
        cleanBoard,
        subjectId,
        chapterNo
      ]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: 'This chapter already exists for this subject'
      });
    }

    // -----------------------------
    // Insert
    // -----------------------------

    const result = await pool.query(
      `
      INSERT INTO syllabus (
        class,
        board,
        subject_id,
        chapter_no,
        chapter_name
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        cleanClass,
        cleanBoard,
        subjectId,
        chapterNo,
        cleanChapterName
      ]
    );

    res.status(201).json({
      message: 'Syllabus chapter added successfully',
      syllabus: result.rows[0]
    });

  } catch (err) {
    console.error('POST /syllabus error:', err);

    // PostgreSQL unique violation
    if (err.code === '23505') {
      return res.status(400).json({
        error: 'This chapter already exists for this subject'
      });
    }

    // Foreign key violation
    if (err.code === '23503') {
      return res.status(400).json({
        error: 'Invalid subject'
      });
    }

    res.status(500).json({
      error: 'Failed to create syllabus',
      details: err.message
    });
  }
});
app.get('/syllabus', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sy.syllabus_id,
        sy.class,
        sy.board,
        sy.subject_id,
        s.subject_name,
        sy.chapter_no,
        sy.chapter_name,
        sy.created_at,
        sy.updated_at
      FROM syllabus sy
      JOIN subjects s
        ON s.subject_id = sy.subject_id
      ORDER BY
        sy.class,
        sy.board,
        sy.subject_id,
        sy.chapter_no
    `);

    res.json(result.rows);

  } catch (err) {
    console.error('GET /syllabus error:', err);

    res.status(500).json({
      error: 'Failed to fetch syllabus',
      details: err.message
    });
  }
});

/* =========================================================
   FACULTY DEVICE TOKEN ROUTES
========================================================= */

app.post('/faculty/device-token', async (req, res) => {
  const {
    faculty_id,
    token,
    platform = 'android',
  } = req.body || {};

  const facultyId = String(faculty_id || '').toUpperCase().trim();
  const deviceToken = String(token || '').trim();
  const devicePlatform = String(platform || 'android').trim();

  if (!facultyId || !deviceToken) {
    return res.status(400).json({
      error: 'faculty_id and token are required',
    });
  }

  try {
    const faculty = await pool.query(
      `
      SELECT faculty_id
      FROM faculty
      WHERE UPPER(TRIM(faculty_id)) = $1
      LIMIT 1
      `,
      [facultyId]
    );

    if (faculty.rows.length === 0) {
      return res.status(404).json({
        error: 'Faculty not found',
      });
    }

    await pool.query(
      `
      INSERT INTO faculty_device_tokens
        (faculty_id, token, platform, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (token)
      DO UPDATE SET
        faculty_id = EXCLUDED.faculty_id,
        platform = EXCLUDED.platform,
        updated_at = CURRENT_TIMESTAMP
      `,
      [facultyId, deviceToken, devicePlatform]
    );

    console.log(
      '[Faculty Token] Registered device token for faculty:',
      facultyId
    );

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error(
      'POST /faculty/device-token error:',
      error
    );

    return res.status(500).json({
      error: 'Failed to register faculty notification device',
    });
  }
});

app.delete('/faculty/device-token', async (req, res) => {
  const { faculty_id, token } = req.body || {};

  const facultyId = String(faculty_id || '').toUpperCase().trim();
  const deviceToken = String(token || '').trim();

  if (!facultyId || !deviceToken) {
    return res.status(400).json({
      error: 'faculty_id and token are required',
    });
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM faculty_device_tokens
      WHERE UPPER(TRIM(faculty_id)) = $1
        AND token = $2
      `,
      [facultyId, deviceToken]
    );

    return res.json({
      success: true,
      removed: result.rowCount || 0,
    });
  } catch (error) {
    console.error(
      'DELETE /faculty/device-token error:',
      error
    );

    return res.status(500).json({
      error: 'Failed to remove faculty notification device',
    });
  }
});



/* =========================================================
   TEST BATCH STUDENTS / MARKS / ATTENDANCE
   Completely separate from Regular Student tables.
========================================================= */

const TEST_BATCH_ADMIN_IDS = new Set(['IG001', 'IG002']);

async function requireTestBatchAdmin(req, res, next) {
  try {
    const candidate = String(
      req.get('x-admin-id') ||
      req.query.adminId ||
      (req.body && req.body.adminId) ||
      ''
    ).toUpperCase().trim();

    if (!TEST_BATCH_ADMIN_IDS.has(candidate)) {
      return res.status(403).json({ error: 'Test Batch administrator access required' });
    }

    const result = await pool.query(
      'SELECT faculty_id FROM faculty WHERE UPPER(TRIM(faculty_id)) = $1 LIMIT 1',
      [candidate]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized administrator' });
    }

    req.testBatchAdminId = candidate;
    next();
  } catch (err) {
    console.error('Test Batch admin authorization error:', err);
    res.status(500).json({ error: 'Failed to verify administrator access' });
  }
}

async function generateNextTestBatchRollNo(client) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['intellekt_test_batch_roll_no']);
  const result = await client.query(
    'SELECT COALESCE(MAX(CAST(SUBSTRING(roll_no FROM 4) AS INTEGER)), 0) AS max_number FROM test_batch_students WHERE roll_no ~ $1',
    ['^IAT[0-9]+$']
  );
  const nextNumber = Number(result.rows[0].max_number || 0) + 1;
  return 'IAT' + String(nextNumber).padStart(3, '0');
}

async function validateTestBatchSeries(seriesId) {
  const result = await pool.query(
    'SELECT id, name FROM test_series WHERE id = $1',
    [Number(seriesId)]
  );
  return result.rows[0] || null;
}

function validateTestBatchSubjects(subjects) {
  const value = String(subjects || '').trim();
  return ['Mathematics', 'Physics', 'Both'].includes(value) ? value : null;
}

function validateTestBatchSubjects(subjects) {
  const value = String(subjects || '').trim();
  return ['Mathematics', 'Physics', 'Both'].includes(value) ? value : null;
}

function validateTestBatchMarks(totalMarks, obtained) {
  const total = Number(totalMarks);
  const raw = String(obtained ?? '').trim().toUpperCase();
  if (!Number.isFinite(total) || total <= 0) return { ok:false, error:'Total marks must be greater than zero' };
  if (!raw) return { ok:false, error:'Obtained marks are required' };
  if (raw === 'A') return { ok:true, obtained:'A' };
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > total) return { ok:false, error:'Obtained marks must be between 0 and total marks, or A' };
  return { ok:true, obtained:String(numeric) };
}

function marksComputedFields(row) {
  const total = Number(row.total_marks || 0);
  const raw = String(row.marks_obtained || '').trim().toUpperCase();
  if (raw === 'A') return { ...row, percentage:null, result_status:'Absent' };
  const percentage = total > 0 ? (Number(raw) / total) * 100 : 0;
  return { ...row, percentage:Number(percentage.toFixed(2)), result_status:percentage >= 40 ? 'Pass' : 'Fail' };
}

app.get('/test-batch/tests', requireTestBatchAdmin, async (req,res) => {
  try {
    const { seriesId, search, status, from, to } = req.query;
    const values=[]; let where='WHERE 1=1';
    if(seriesId){ values.push(Number(seriesId)); where+=' AND t.test_series_id=$'+values.length; }
    if(search){ values.push('%'+String(search).trim()+'%'); where+=' AND (t.test_code ILIKE $'+values.length+' OR t.subject_name ILIKE $'+values.length+')'; }
    if(status){ values.push(String(status)); where+=' AND t.status=$'+values.length; }
    if(from){ values.push(from); where+=' AND t.writing_date >= $'+values.length; }
    if(to){ values.push(to); where+=' AND t.writing_date <= $'+values.length; }
    const result=await pool.query(
      'SELECT t.*,s.name AS test_series_name FROM test_batch_tests t JOIN test_series s ON s.id=t.test_series_id '+where+
      ' ORDER BY t.writing_date DESC,t.test_code ASC', values);
    res.json({tests:result.rows});
  } catch(err){ console.error('GET /test-batch/tests error:',err); res.status(500).json({error:'Failed to fetch Test Batch tests'}); }
});

app.post('/test-batch/tests', requireTestBatchAdmin, async (req,res) => {
  try {
    const {
      test_code,test_series_id,subject_name,test_date,writing_date,slot_start,slot_end,
      duration_minutes,total_marks,portion,chapter,application_open_date,application_close_date,status
    }=req.body||{};
    if(!test_code||!test_series_id||!subject_name||!test_date||!writing_date||!duration_minutes||!total_marks){
      return res.status(400).json({error:'Test code, test batch, subject, test date, writing date, duration and total marks are required'});
    }
    const series=await validateTestBatchSeries(test_series_id);
    if(!series)return res.status(400).json({error:'Invalid Test Series'});
    const result=await pool.query(
      'INSERT INTO test_batch_tests(test_code,test_series_id,subject_name,test_date,writing_date,slot_start,slot_end,duration_minutes,total_marks,portion,chapter,application_open_date,application_close_date,status,created_by) '+
      'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
      [String(test_code).trim().toUpperCase(),Number(test_series_id),String(subject_name).trim(),test_date,writing_date,slot_start||null,slot_end||null,Number(duration_minutes),Number(total_marks),portion||null,chapter||null,application_open_date||null,application_close_date||null,status||'Scheduled',req.testBatchAdminId]);
    res.status(201).json({message:'Test Batch test created successfully',test:result.rows[0]});
  } catch(err){
    console.error('POST /test-batch/tests error:',err);
    if(err.code==='23505')return res.status(400).json({error:'Test code already exists'});
    res.status(500).json({error:'Failed to create Test Batch test',details:err.message});
  }
});

app.put('/test-batch/tests/:id', requireTestBatchAdmin, async (req,res) => {
  try {
    const {
      test_code,test_series_id,subject_name,test_date,writing_date,slot_start,slot_end,
      duration_minutes,total_marks,portion,chapter,application_open_date,application_close_date,status
    }=req.body||{};
    const result=await pool.query(
      'UPDATE test_batch_tests SET test_code=$1,test_series_id=$2,subject_name=$3,test_date=$4,writing_date=$5,slot_start=$6,slot_end=$7,duration_minutes=$8,total_marks=$9,portion=$10,chapter=$11,application_open_date=$12,application_close_date=$13,status=$14,updated_at=CURRENT_TIMESTAMP WHERE id=$15 RETURNING *',
      [String(test_code).trim().toUpperCase(),Number(test_series_id),String(subject_name).trim(),test_date,writing_date,slot_start||null,slot_end||null,Number(duration_minutes),Number(total_marks),portion||null,chapter||null,application_open_date||null,application_close_date||null,status||'Scheduled',Number(req.params.id)]);
    if(!result.rows.length)return res.status(404).json({error:'Test Batch test not found'});
    res.json({message:'Test Batch test updated successfully',test:result.rows[0]});
  } catch(err){
    console.error('PUT /test-batch/tests/:id error:',err);
    if(err.code==='23505')return res.status(400).json({error:'Test code already exists'});
    res.status(500).json({error:'Failed to update Test Batch test',details:err.message});
  }
});

app.delete('/test-batch/tests/:id', requireTestBatchAdmin, async (req,res) => {
  try {
    const result=await pool.query('DELETE FROM test_batch_tests WHERE id=$1 RETURNING id,test_code',[Number(req.params.id)]);
    if(!result.rows.length)return res.status(404).json({error:'Test Batch test not found'});
    res.json({message:'Test Batch test deleted successfully',test:result.rows[0]});
  } catch(err){ console.error('DELETE /test-batch/tests/:id error:',err); res.status(500).json({error:'Failed to delete Test Batch test'}); }
});

app.get('/test-batch/tests/:testCode/results', requireTestBatchAdmin, async (req,res) => {
  try {
    const result=await pool.query(
      'SELECT m.id,m.roll_no,s.name,m.subject_name,m.total_marks,m.marks_obtained,m.comments '+
      'FROM test_batch_marks m JOIN test_batch_students s ON s.roll_no=m.roll_no '+
      'WHERE UPPER(TRIM(m.test_code))=UPPER(TRIM($1)) ORDER BY m.roll_no ASC',
      [req.params.testCode]);
    res.json({results:result.rows.map(marksComputedFields)});
  } catch(err){ console.error('GET /test-batch/tests/:testCode/results error:',err); res.status(500).json({error:'Failed to fetch Test Batch results'}); }
});


/* =========================================================
   TEST BATCH MARK ENTRY
   Only completed/returned tests are eligible.
   Marks are stored only in test_batch_marks.
========================================================= */

app.get('/test-batch/mark-entry/tests', requireTestBatchAdmin, async (req, res) => {
  try {
    const { seriesId, search } = req.query;
    const values = [];
    let where = "WHERE t.status IN ('Completed','Returned')";

    if (seriesId) {
      values.push(Number(seriesId));
      where += ' AND t.test_series_id=$' + values.length;
    }

    if (search) {
      values.push('%' + String(search).trim() + '%');
      where += ' AND (t.test_code ILIKE $' + values.length + ' OR t.subject_name ILIKE $' + values.length + ')';
    }

    const result = await pool.query(
      `SELECT t.id,t.test_code,t.test_series_id,s.name AS test_series_name,t.subject_name,
      t.test_date,t.writing_date,t.slot_start,t.slot_end,t.total_marks,t.status,
      t.marks_entry_status,t.marks_finalized_at
      FROM test_batch_tests t
      JOIN test_series s ON s.id=t.test_series_id
      ` + where +
      ` ORDER BY t.writing_date DESC,t.test_code ASC`,
      values
    );

    res.json({ tests: result.rows });
  } catch (err) {
    console.error('GET /test-batch/mark-entry/tests error:', err);
    res.status(500).json({ error: 'Failed to fetch completed Test Batch tests' });
  }
});

app.get('/test-batch/tests/:testCode/mark-entry', requireTestBatchAdmin, async (req, res) => {
  try {
    const code = String(req.params.testCode || '').trim().toUpperCase();

    const testResult = await pool.query(
      `SELECT
         t.id,t.test_code,t.test_series_id,s.name AS test_series_name,
         t.subject_name,t.test_date,t.writing_date,t.slot_start,t.slot_end,
         t.total_marks,t.status,t.marks_entry_status,t.marks_finalized_at
       FROM test_batch_tests t
       JOIN test_series s ON s.id=t.test_series_id
       WHERE UPPER(TRIM(t.test_code))=UPPER(TRIM($1))
       LIMIT 1`,
      [code]
    );

    if (testResult.rows.length === 0) {
      return res.status(404).json({ error: 'Test Batch test not found' });
    }

    const test = testResult.rows[0];

    if (!['Completed', 'Returned'].includes(test.status)) {
      return res.status(400).json({
        error: 'Only completed or returned Test Batch tests are available for mark entry'
      });
    }

    const studentsResult = await pool.query(
      `SELECT
         s.roll_no,
         s.name,
         a.status AS attendance_status,
         COALESCE(m.marks_obtained, '') AS marks_obtained,
         COALESCE(m.comments, '') AS remarks,
         m.updated_at AS marks_updated_at
       FROM test_batch_tests t
       JOIN test_batch_students s
         ON s.test_series_id=t.test_series_id
       JOIN test_batch_attendance a
         ON a.roll_no=s.roll_no
        AND a.attendance_date=t.writing_date
        AND a.status='Present'
       LEFT JOIN test_batch_marks m
         ON m.roll_no=s.roll_no
        AND UPPER(TRIM(m.test_code))=UPPER(TRIM(t.test_code))
        AND UPPER(TRIM(m.subject_name))=UPPER(TRIM(t.subject_name))
       WHERE t.id=$1
       ORDER BY s.roll_no ASC`,
      [test.id]
    );

    res.json({ test, students: studentsResult.rows });
  } catch (err) {
    console.error('GET /test-batch/tests/:testCode/mark-entry error:', err);
    res.status(500).json({ error: 'Failed to load Test Batch mark entry' });
  }
});

app.post('/test-batch/tests/:testCode/marks', requireTestBatchAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const code = String(req.params.testCode || '').trim().toUpperCase();
    const records = Array.isArray(req.body?.records) ? req.body.records : [];

    if (records.length === 0) {
      return res.status(400).json({ error: 'At least one mark record is required' });
    }

    const testResult = await client.query(
      `SELECT id,test_code,test_series_id,subject_name,writing_date,total_marks,status,marks_entry_status
       FROM test_batch_tests
       WHERE UPPER(TRIM(test_code))=UPPER(TRIM($1))
       LIMIT 1`,
      [code]
    );

    if (testResult.rows.length === 0) {
      return res.status(404).json({ error: 'Test Batch test not found' });
    }

    const test = testResult.rows[0];

    if (!['Completed', 'Returned'].includes(test.status)) {
      return res.status(400).json({
        error: 'Only completed or returned Test Batch tests can receive marks'
      });
    }

    if (test.marks_entry_status === 'Finalized') {
      return res.status(400).json({
        error: 'Marks for this test have already been finalized and are locked'
      });
    }

    await client.query('BEGIN');

    for (const record of records) {
      const rollNo = String(record.roll_no || '').trim().toUpperCase();
      const rawMarks = String(record.marks_obtained ?? '').trim().toUpperCase();
      const remarks = String(record.remarks ?? record.comments ?? '').trim();

      if (!/^IAT[0-9]{3,}$/.test(rollNo)) {
        throw new Error('Invalid Test Batch roll number: ' + rollNo);
      }

      const eligible = await client.query(
        `SELECT s.roll_no
         FROM test_batch_students s
         JOIN test_batch_attendance a
           ON a.roll_no=s.roll_no
          AND a.attendance_date=$2
          AND a.status='Present'
         WHERE s.roll_no=$1
           AND s.test_series_id=$3
         LIMIT 1`,
        [rollNo, test.writing_date, test.test_series_id]
      );

      if (eligible.rows.length === 0) {
        throw new Error('Student ' + rollNo + ' did not appear for this Test Batch test');
      }

      if (!rawMarks) {
        await client.query(
          `DELETE FROM test_batch_marks
           WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1))
             AND UPPER(TRIM(test_code))=UPPER(TRIM($2))
             AND UPPER(TRIM(subject_name))=UPPER(TRIM($3))`,
          [rollNo, code, test.subject_name]
        );
        continue;
      }

      const validation = validateTestBatchMarks(test.total_marks, rawMarks);
      if (!validation.ok) {
        throw new Error(rollNo + ': ' + validation.error);
      }

      await client.query(
        `INSERT INTO test_batch_marks
          (roll_no,test_code,subject_name,total_marks,marks_obtained,comments,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT (roll_no,test_code,subject_name)
         DO UPDATE SET
           total_marks=EXCLUDED.total_marks,
           marks_obtained=EXCLUDED.marks_obtained,
           comments=EXCLUDED.comments,
           updated_at=CURRENT_TIMESTAMP`,
        [rollNo, code, test.subject_name, Number(test.total_marks), validation.obtained, remarks || null]
      );
    }

    await client.query(
      `UPDATE test_batch_tests
       SET marks_entry_status='Draft',
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [test.id]
    );

    await client.query('COMMIT');

    res.json({ message: 'Test Batch marks saved successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /test-batch/tests/:testCode/marks error:', err);
    res.status(400).json({ error: err.message || 'Failed to save Test Batch marks' });
  } finally {
    client.release();
  }
});

app.post('/test-batch/tests/:testCode/marks/finalize', requireTestBatchAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const code = String(req.params.testCode || '').trim().toUpperCase();

    const testResult = await client.query(
      `SELECT id,test_code,test_series_id,subject_name,writing_date,total_marks,status,marks_entry_status
       FROM test_batch_tests
       WHERE UPPER(TRIM(test_code))=UPPER(TRIM($1))
       LIMIT 1`,
      [code]
    );

    if (testResult.rows.length === 0) {
      return res.status(404).json({ error: 'Test Batch test not found' });
    }

    const test = testResult.rows[0];

    if (!['Completed', 'Returned'].includes(test.status)) {
      return res.status(400).json({
        error: 'Only completed or returned Test Batch tests can be finalized'
      });
    }

    if (test.marks_entry_status === 'Finalized') {
      return res.json({ message: 'Marks are already finalized' });
    }

    const result = await client.query(
      `SELECT
         s.roll_no,
         COALESCE(NULLIF(TRIM(m.marks_obtained), ''), NULL) AS marks_obtained
       FROM test_batch_students s
       JOIN test_batch_attendance a
         ON a.roll_no=s.roll_no
        AND a.attendance_date=$2
        AND a.status='Present'
       LEFT JOIN test_batch_marks m
         ON m.roll_no=s.roll_no
        AND UPPER(TRIM(m.test_code))=UPPER(TRIM($3))
        AND UPPER(TRIM(m.subject_name))=UPPER(TRIM($4))
       WHERE s.test_series_id=$1
       ORDER BY s.roll_no ASC`,
      [test.test_series_id, test.writing_date, code, test.subject_name]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'No Test Batch students marked Present for this test'
      });
    }

    const missing = result.rows.filter(row => !row.marks_obtained);
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Enter marks for all students before finalizing',
        missing_roll_numbers: missing.map(row => row.roll_no)
      });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE test_batch_tests
       SET marks_entry_status='Finalized',
           marks_finalized_at=CURRENT_TIMESTAMP,
           marks_finalized_by=$1,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$2`,
      [req.testBatchAdminId, test.id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Test Batch marks finalized successfully',
      marks_entry_status: 'Finalized'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /test-batch/tests/:testCode/marks/finalize error:', err);
    res.status(400).json({ error: err.message || 'Failed to finalize Test Batch marks' });
  } finally {
    client.release();
  }
});

app.delete('/test-batch/tests/:testCode/marks/draft', requireTestBatchAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const code = String(req.params.testCode || '').trim().toUpperCase();

    const testResult = await client.query(
      `SELECT id,marks_entry_status
       FROM test_batch_tests
       WHERE UPPER(TRIM(test_code))=UPPER(TRIM($1))
       LIMIT 1`,
      [code]
    );

    if (testResult.rows.length === 0) {
      return res.status(404).json({ error: 'Test Batch test not found' });
    }

    if (testResult.rows[0].marks_entry_status === 'Finalized') {
      return res.status(400).json({ error: 'Finalized marks cannot be reset' });
    }

    await client.query('BEGIN');

    await client.query(
      `DELETE FROM test_batch_marks
       WHERE UPPER(TRIM(test_code))=UPPER(TRIM($1))`,
      [code]
    );

    await client.query(
      `UPDATE test_batch_tests
       SET marks_entry_status='Pending',
           marks_finalized_at=NULL,
           marks_finalized_by=NULL,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [testResult.rows[0].id]
    );

    await client.query('COMMIT');

    res.json({ message: 'Test Batch draft marks reset successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /test-batch/tests/:testCode/marks/draft error:', err);
    res.status(500).json({ error: 'Failed to reset Test Batch draft marks' });
  } finally {
    client.release();
  }
});

app.get('/test-batch/series', requireTestBatchAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM test_series ORDER BY id ASC');
    res.json({ series: result.rows });
  } catch (err) {
    console.error('GET /test-batch/series error:', err);
    res.status(500).json({ error: 'Failed to fetch Test Batch series' });
  }
});

app.get('/test-batch/students/next-roll', requireTestBatchAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COALESCE(MAX(CAST(SUBSTRING(roll_no FROM 4) AS INTEGER)), 0) AS max_number FROM test_batch_students WHERE roll_no ~ $1',
      ['^IAT[0-9]+$']
    );
    const nextNumber = Number(result.rows[0].max_number || 0) + 1;
    res.json({ roll_no: 'IAT' + String(nextNumber).padStart(3, '0') });
  } catch (err) {
    console.error('GET /test-batch/students/next-roll error:', err);
    res.status(500).json({ error: 'Failed to generate next Test Batch roll number' });
  }
});

app.get('/test-batch/students', requireTestBatchAdmin, async (req, res) => {
  try {
    const { search, seriesId } = req.query;
    const values = [];
    let where = 'WHERE 1=1';

    if (seriesId) {
      values.push(Number(seriesId));
      where += ' AND s.test_series_id = $' + values.length;
    }

    if (search) {
      values.push('%' + String(search).trim() + '%');
      where += ' AND (s.roll_no ILIKE $' + values.length + ' OR s.name ILIKE $' + values.length + ')';
    }

    const result = await pool.query(
      'SELECT s.roll_no,s.name,s.class,s.board,s.mode_of_education,s.phone,s.email,s.school_name,s.subjects,' +
      's.created_at,s.updated_at,s.test_series_id,ts.name AS test_series_name ' +
      'FROM test_batch_students s JOIN test_series ts ON ts.id=s.test_series_id ' +
      where + ' ORDER BY s.roll_no ASC',
      values
    );

    res.json({ students: result.rows });
  } catch (err) {
    console.error('GET /test-batch/students error:', err);
    res.status(500).json({ error: 'Failed to fetch Test Batch students' });
  }
});

app.post('/test-batch/students', requireTestBatchAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      name, class: className, board, mode_of_education,
      phone, email, school_name, password, test_series_id, subjects
    } = req.body || {};

    if (!name || !className || !test_series_id || !subjects) {
      return res.status(400).json({ error:'Student name, class, subjects and test series are required' });
    }

    const validSubjects = validateTestBatchSubjects(subjects);
    if (!validSubjects) return res.status(400).json({ error:'Select Mathematics, Physics or Both' });

    if (!await validateTestBatchSeries(test_series_id)) {
      return res.status(400).json({ error:'Invalid Test Series' });
    }

    await client.query('BEGIN');

    const rollNo = await generateNextTestBatchRollNo(client);
    const finalPassword = password && String(password).trim()
      ? String(password).trim()
      : rollNo;

    await client.query(
      'INSERT INTO test_batch_students ' +
      '(roll_no,name,class,board,mode_of_education,phone,email,school_name,subjects,password,must_reset_password,test_series_id,created_by) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12)',
      [
        rollNo,
        String(name).trim(),
        className ? String(className).trim() : null,
        board ? String(board).trim() : null,
        mode_of_education ? String(mode_of_education).trim() : null,
        phone ? String(phone).trim() : null,
        email ? String(email).trim() : null,
        school_name ? String(school_name).trim() : null,
        validSubjects,
        finalPassword,
        Number(test_series_id),
        req.testBatchAdminId
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ message:'Test Batch student added successfully', roll_no:rollNo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /test-batch/students error:', err);
    if (err.code === '23505') return res.status(400).json({ error:'Duplicate Test Batch student data' });
    if (err.code === '23503') return res.status(400).json({ error:'Invalid Test Series or administrator' });
    res.status(500).json({ error:'Failed to add Test Batch student', details:err.message });
  } finally {
    client.release();
  }
});

app.put('/test-batch/students/:roll_no', requireTestBatchAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const oldRoll = String(req.params.roll_no).toUpperCase().trim();
    const {
      name, class: className, board, mode_of_education,
      phone, email, school_name, password, test_series_id, subjects
    } = req.body || {};

    if (!name || !className || !test_series_id || !subjects) return res.status(400).json({ error:'Student name, class, subjects and test series are required' });
    const validSubjects = validateTestBatchSubjects(subjects);
    if (!validSubjects) return res.status(400).json({ error:'Select Mathematics, Physics or Both' });
    if (!await validateTestBatchSeries(test_series_id)) return res.status(400).json({ error:'Invalid Test Series' });

    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT roll_no FROM test_batch_students WHERE UPPER(TRIM(roll_no))=$1',
      [oldRoll]
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error:'Test Batch student not found' });
    }

    const values = [
      String(name).trim(),
      className ? String(className).trim() : null,
      board ? String(board).trim() : null,
      mode_of_education ? String(mode_of_education).trim() : null,
      phone ? String(phone).trim() : null,
      email ? String(email).trim() : null,
      school_name ? String(school_name).trim() : null,
      validSubjects,
      Number(test_series_id)
    ];

    let query =
      'UPDATE test_batch_students SET name=$1,class=$2,board=$3,mode_of_education=$4,' +
      'phone=$5,email=$6,school_name=$7,subjects=$8,test_series_id=$9,updated_at=CURRENT_TIMESTAMP';

    if (password && String(password).trim()) {
      values.push(String(password).trim(), oldRoll);
      query += ',password=$10,must_reset_password=TRUE WHERE UPPER(TRIM(roll_no))=$11 RETURNING roll_no';
    } else {
      values.push(oldRoll);
      query += ' WHERE UPPER(TRIM(roll_no))=$10 RETURNING roll_no';
    }

    const result = await client.query(query, values);
    await client.query('COMMIT');

    res.json({ message:'Test Batch student updated successfully', roll_no:result.rows[0].roll_no });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /test-batch/students/:roll_no error:', err);
    if (err.code === '23505') return res.status(400).json({ error:'Email already exists in Test Batch' });
    res.status(500).json({ error:'Failed to update Test Batch student', details:err.message });
  } finally {
    client.release();
  }
});

app.delete('/test-batch/students/:roll_no', requireTestBatchAdmin, async (req,res) => {
  const client = await pool.connect();
  try {
    const roll = String(req.params.roll_no).toUpperCase().trim();
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT roll_no FROM test_batch_students WHERE UPPER(TRIM(roll_no))=$1',
      [roll]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error:'Test Batch student not found' });
    }
    await client.query('DELETE FROM test_batch_students WHERE UPPER(TRIM(roll_no))=$1', [roll]);
    await client.query('COMMIT');
    res.json({ message:'Test Batch student deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /test-batch/students/:roll_no error:', err);
    res.status(500).json({ error:'Failed to delete Test Batch student' });
  } finally {
    client.release();
  }
});

app.get('/test-batch/marks', requireTestBatchAdmin, async (req,res) => {
  try {
    const { search, seriesId, testCode } = req.query;
    const values = [];
    let where = 'WHERE 1=1';

    if (seriesId) {
      values.push(Number(seriesId));
      where += ' AND s.test_series_id=$' + values.length;
    }
    if (search) {
      values.push('%' + String(search).trim() + '%');
      where += ' AND (s.roll_no ILIKE $' + values.length + ' OR s.name ILIKE $' + values.length + ')';
    }
    if (testCode) {
      values.push('%' + String(testCode).trim() + '%');
      where += ' AND m.test_code ILIKE $' + values.length;
    }

    const result = await pool.query(
      'SELECT m.id,m.roll_no,s.name,ts.name AS test_series_name,m.test_code,m.subject_name,' +
      'm.total_marks,m.marks_obtained,m.comments,m.created_at,m.updated_at ' +
      'FROM test_batch_marks m JOIN test_batch_students s ON s.roll_no=m.roll_no ' +
      'JOIN test_series ts ON ts.id=s.test_series_id ' + where +
      ' ORDER BY m.created_at DESC,m.id DESC',
      values
    );

    res.json({ marks:result.rows.map(marksComputedFields) });
  } catch (err) {
    console.error('GET /test-batch/marks error:', err);
    res.status(500).json({ error:'Failed to fetch Test Batch marks' });
  }
});

app.post('/test-batch/marks', requireTestBatchAdmin, async (req,res) => {
  try {
    const { roll_no,test_code,subject_name,total_marks,marks_obtained,comments } = req.body || {};
    if (!roll_no || !test_code || !subject_name) return res.status(400).json({ error:'Student, test code and subject are required' });

    const student = await pool.query(
      'SELECT roll_no FROM test_batch_students WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1))',
      [roll_no]
    );
    if (student.rows.length === 0) return res.status(404).json({ error:'Test Batch student not found' });

    const validation = validateTestBatchMarks(total_marks, marks_obtained);
    if (!validation.ok) return res.status(400).json({ error:validation.error });

    const result = await pool.query(
      'INSERT INTO test_batch_marks(roll_no,test_code,subject_name,total_marks,marks_obtained,comments) ' +
      'VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [
        String(roll_no).trim().toUpperCase(),
        String(test_code).trim(),
        String(subject_name).trim(),
        Number(total_marks),
        validation.obtained,
        comments ? String(comments).trim() : null
      ]
    );

    res.status(201).json({ message:'Test Batch mark added successfully', mark:marksComputedFields(result.rows[0]) });
  } catch (err) {
    console.error('POST /test-batch/marks error:', err);
    if (err.code === '23505') return res.status(400).json({ error:'Mark already exists for this student, test and subject' });
    res.status(500).json({ error:'Failed to add Test Batch mark', details:err.message });
  }
});

app.put('/test-batch/marks/:id', requireTestBatchAdmin, async (req,res) => {
  try {
    const { test_code,subject_name,total_marks,marks_obtained,comments } = req.body || {};
    const validation = validateTestBatchMarks(total_marks, marks_obtained);
    if (!validation.ok) return res.status(400).json({ error:validation.error });

    const result = await pool.query(
      'UPDATE test_batch_marks SET test_code=$1,subject_name=$2,total_marks=$3,marks_obtained=$4,' +
      'comments=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$6 RETURNING *',
      [String(test_code).trim(),String(subject_name).trim(),Number(total_marks),validation.obtained,comments ? String(comments).trim() : null,Number(req.params.id)]
    );

    if (result.rows.length===0) return res.status(404).json({ error:'Test Batch mark not found' });
    res.json({ message:'Test Batch mark updated successfully', mark:marksComputedFields(result.rows[0]) });
  } catch (err) {
    console.error('PUT /test-batch/marks/:id error:', err);
    if (err.code === '23505') return res.status(400).json({ error:'Mark already exists for this student, test and subject' });
    res.status(500).json({ error:'Failed to update Test Batch mark' });
  }
});

app.delete('/test-batch/marks/:id', requireTestBatchAdmin, async (req,res) => {
  try {
    const result = await pool.query('DELETE FROM test_batch_marks WHERE id=$1 RETURNING id', [Number(req.params.id)]);
    if (result.rows.length===0) return res.status(404).json({ error:'Test Batch mark not found' });
    res.json({ message:'Test Batch mark deleted successfully' });
  } catch (err) {
    console.error('DELETE /test-batch/marks/:id error:', err);
    res.status(500).json({ error:'Failed to delete Test Batch mark' });
  }
});

app.get('/test-batch/attendance', requireTestBatchAdmin, async (req,res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0,10);
    const { search, seriesId } = req.query;
    const values = [date];
    let where = 'WHERE 1=1';

    if (seriesId) {
      values.push(Number(seriesId));
      where += ' AND s.test_series_id=$' + values.length;
    }

    if (search) {
      values.push('%' + String(search).trim() + '%');
      where += ' AND (s.roll_no ILIKE $' + values.length + ' OR s.name ILIKE $' + values.length + ')';
    }

    // Test Batch attendance is date-eligible only.
    // A student appears on the marking screen only when they have
    // a registered test application for the selected writing date.
    const result = await pool.query(
      `SELECT
          s.roll_no,
          s.name,
          ts.name AS test_series_name,
          a.id,
          a.attendance_date,
          a.status,
          a.marked_by,
          a.marked_at,
          a.edited_by,
          a.edited_at
        FROM test_batch_students s
        JOIN test_series ts
          ON ts.id = s.test_series_id
        LEFT JOIN test_batch_attendance a
          ON a.roll_no = s.roll_no
         AND a.attendance_date = $1
        ${where}
        AND EXISTS (
          SELECT 1
          FROM test_registrations tr
          WHERE UPPER(TRIM(tr.roll_no)) = UPPER(TRIM(s.roll_no))
            AND tr.writing_date = $1
        )
        ORDER BY s.roll_no ASC`,
      values
    );

    res.json({ attendance:result.rows });
  } catch (err) {
    console.error('GET /test-batch/attendance error:', err);
    res.status(500).json({ error:'Failed to fetch Test Batch attendance' });
  }
});

app.post('/test-batch/attendance', requireTestBatchAdmin, async (req,res) => {
  const client = await pool.connect();
  try {
    const { records, attendanceDate } = req.body || {};
    if (!attendanceDate || !Array.isArray(records) || records.length===0) {
      return res.status(400).json({ error:'attendanceDate and records are required' });
    }

    await client.query('BEGIN');

    for (const record of records) {
      const roll = String(record.roll_no || '').trim().toUpperCase();
      const status = String(record.status || '').trim();

      if (!roll || !['Present','Absent'].includes(status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error:'Each attendance record needs a valid roll number and status' });
      }

      const student = await client.query(
        'SELECT roll_no FROM test_batch_students WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1))',
        [roll]
      );

      if (student.rows.length===0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error:'Test Batch student not found: ' + roll });
      }

      // Enforce the same eligibility rule on the server so an API caller
      // cannot create attendance for a Test Batch student who did not
      // register for a test on the selected attendance date.
      const registration = await client.query(
        `SELECT 1
         FROM test_registrations tr
         WHERE UPPER(TRIM(tr.roll_no)) = UPPER(TRIM($1))
           AND tr.writing_date = $2
         LIMIT 1`,
        [roll, attendanceDate]
      );

      if (registration.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `No registered test application found for ${roll} on ${attendanceDate}`
        });
      }

      await client.query(
        'INSERT INTO test_batch_attendance(roll_no,attendance_date,status,marked_by,marked_at,edited_by,edited_at) ' +
        'VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,NULL,NULL) ' +
        'ON CONFLICT(roll_no,attendance_date) DO UPDATE SET status=EXCLUDED.status,edited_by=EXCLUDED.marked_by,edited_at=CURRENT_TIMESTAMP',
        [roll,attendanceDate,status,req.testBatchAdminId]
      );
    }

    await client.query('COMMIT');
    res.json({ message:'Test Batch attendance saved successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /test-batch/attendance error:', err);
    res.status(500).json({ error:'Failed to save Test Batch attendance', details:err.message });
  } finally {
    client.release();
  }
});

app.put('/test-batch/attendance/:id', requireTestBatchAdmin, async (req,res) => {
  try {
    const status = String(req.body?.status || '').trim();
    if (!['Present','Absent'].includes(status)) {
      return res.status(400).json({ error:'Invalid attendance status' });
    }

    const result = await pool.query(
      `UPDATE test_batch_attendance a
       SET status=$1,
           edited_by=$2,
           edited_at=CURRENT_TIMESTAMP
       WHERE a.id=$3
         AND EXISTS (
           SELECT 1
           FROM test_registrations tr
           WHERE UPPER(TRIM(tr.roll_no)) = UPPER(TRIM(a.roll_no))
             AND tr.writing_date = a.attendance_date
         )
       RETURNING a.*`,
      [status,req.testBatchAdminId,Number(req.params.id)]
    );

    if (result.rows.length===0) {
      return res.status(404).json({
        error:'Eligible Test Batch attendance record not found'
      });
    }

    res.json({ message:'Test Batch attendance updated successfully', attendance:result.rows[0] });
  } catch (err) {
    console.error('PUT /test-batch/attendance/:id error:', err);
    res.status(500).json({ error:'Failed to update Test Batch attendance' });
  }
});

app.get('/test-batch/attendance-report', requireTestBatchAdmin, async (req,res) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0,10);
    const to = req.query.to || from;
    const { search, seriesId } = req.query;
    const values = [from,to];
    let where = 'WHERE a.attendance_date BETWEEN $1 AND $2';

    if (seriesId) {
      values.push(Number(seriesId));
      where += ' AND s.test_series_id=$' + values.length;
    }

    if (search) {
      values.push('%' + String(search).trim() + '%');
      where += ' AND (s.roll_no ILIKE $' + values.length + ' OR s.name ILIKE $' + values.length + ')';
    }

    const result = await pool.query(
      `SELECT
          a.id,
          a.roll_no,
          s.name,
          ts.name AS test_series_name,
          a.attendance_date,
          a.status,
          a.marked_by,
          a.marked_at,
          a.edited_by,
          a.edited_at
        FROM test_batch_attendance a
        JOIN test_batch_students s
          ON s.roll_no=a.roll_no
        JOIN test_series ts
          ON ts.id=s.test_series_id
        ${where}
        AND EXISTS (
          SELECT 1
          FROM test_registrations tr
          WHERE UPPER(TRIM(tr.roll_no)) = UPPER(TRIM(a.roll_no))
            AND tr.writing_date = a.attendance_date
        )
        ORDER BY a.attendance_date DESC,a.roll_no ASC`,
      values
    );

    res.json({ attendance:result.rows });
  } catch (err) {
    console.error('GET /test-batch/attendance-report error:', err);
    res.status(500).json({ error:'Failed to fetch Test Batch attendance report' });
  }
});

app.get('/test-batch/dashboard', requireTestBatchAdmin, async (req,res) => {
  try {
    const { seriesId, from, to } = req.query;
    const studentValues = [];
    let studentWhere = 'WHERE 1=1';

    if (seriesId) {
      studentValues.push(Number(seriesId));
      studentWhere += ' AND s.test_series_id=$' + studentValues.length;
    }

    const totalResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM test_batch_students s ' + studentWhere,
      studentValues
    );

    const seriesCounts = await pool.query(
      'SELECT ts.id,ts.name,COUNT(s.roll_no)::int AS count FROM test_series ts ' +
      'LEFT JOIN test_batch_students s ON s.test_series_id=ts.id ' +
      'GROUP BY ts.id,ts.name ORDER BY ts.id'
    );

    const recent = await pool.query(
      'SELECT s.roll_no,s.name,s.created_at,ts.name AS test_series_name FROM test_batch_students s ' +
      'JOIN test_series ts ON ts.id=s.test_series_id ' + studentWhere +
      ' ORDER BY s.created_at DESC LIMIT 10',
      studentValues
    );

    const dateFrom = from || '1900-01-01';
    const dateTo = to || '2999-12-31';

    const attendance = await pool.query(
      'SELECT COUNT(*) FILTER(WHERE a.status IN (\'Present\',\'Absent\'))::int AS total,' +
      'COUNT(*) FILTER(WHERE a.status=\'Present\')::int AS present ' +
      'FROM test_batch_attendance a JOIN test_batch_students s ON s.roll_no=a.roll_no ' +
      'WHERE a.attendance_date BETWEEN $1 AND $2 ' +
      'AND EXISTS (' +
      '  SELECT 1 FROM test_registrations tr ' +
      '  WHERE UPPER(TRIM(tr.roll_no)) = UPPER(TRIM(a.roll_no)) ' +
      '    AND tr.writing_date = a.attendance_date' +
      ') ' +
      (seriesId ? 'AND s.test_series_id=$3' : ''),
      seriesId ? [dateFrom,dateTo,Number(seriesId)] : [dateFrom,dateTo]
    );

    const marks = await pool.query(
      'SELECT COALESCE(SUM(CASE WHEN UPPER(TRIM(m.marks_obtained))=\'A\' THEN 0 ELSE CAST(m.marks_obtained AS NUMERIC) END),0) AS obtained,' +
      'COALESCE(SUM(m.total_marks),0) AS total ' +
      'FROM test_batch_marks m JOIN test_batch_students s ON s.roll_no=m.roll_no ' +
      'WHERE 1=1 ' + (seriesId ? 'AND s.test_series_id=$1' : ''),
      seriesId ? [Number(seriesId)] : []
    );

    const attTotal=Number(attendance.rows[0].total||0);
    const attPresent=Number(attendance.rows[0].present||0);
    const markTotal=Number(marks.rows[0].total||0);
    const markObtained=Number(marks.rows[0].obtained||0);

    res.json({
      totalStudents:Number(totalResult.rows[0].count||0),
      attendancePercentage:attTotal?attPresent/attTotal*100:0,
      marksPercentage:markTotal?markObtained/markTotal*100:0,
      seriesCounts:seriesCounts.rows,
      recentStudents:recent.rows
    });
  } catch(err) {
    console.error('GET /test-batch/dashboard error:',err);
    res.status(500).json({ error:'Failed to fetch Test Batch dashboard' });
  }
});

app.get('/test-batch/student/:roll_no', async (req,res) => {
  try {
    const roll=String(req.params.roll_no).toUpperCase().trim();
    if(!/^IAT[0-9]{3,}$/.test(roll)) return res.status(400).json({error:'Invalid Test Batch roll number'});

    const studentResult=await pool.query(
      'SELECT s.roll_no,s.name,s.class,s.board,s.mode_of_education,s.phone,s.email,s.school_name,s.subjects,' +
      's.test_series_id,ts.name AS test_series_name FROM test_batch_students s ' +
      'JOIN test_series ts ON ts.id=s.test_series_id WHERE s.roll_no=$1',
      [roll]
    );

    if(studentResult.rows.length===0) return res.status(404).json({error:'Test Batch student not found'});

    const marksResult=await pool.query(
      'SELECT id,test_code,subject_name,total_marks,marks_obtained,comments,created_at ' +
      'FROM test_batch_marks WHERE roll_no=$1 ORDER BY created_at DESC,id DESC',
      [roll]
    );

    const attendanceResult=await pool.query(
      'SELECT a.id,a.attendance_date,a.status,a.marked_by,a.marked_at,a.edited_by,a.edited_at ' +
      'FROM test_batch_attendance a ' +
      'WHERE UPPER(TRIM(a.roll_no))=UPPER(TRIM($1)) ' +
      'AND EXISTS (' +
      '  SELECT 1 FROM test_registrations tr ' +
      '  WHERE UPPER(TRIM(tr.roll_no))=UPPER(TRIM(a.roll_no)) ' +
      '    AND tr.writing_date=a.attendance_date' +
      ') ' +
      'ORDER BY a.attendance_date DESC,a.id DESC LIMIT 100',
      [roll]
    );

    const attendanceTotal=attendanceResult.rows.length;
    const attendancePresent=attendanceResult.rows.filter(a=>a.status==='Present').length;

    res.json({
      student:studentResult.rows[0],
      marks:marksResult.rows.map(marksComputedFields),
      attendance:attendanceResult.rows,
      attendancePercentage:attendanceTotal?attendancePresent/attendanceTotal*100:0
    });
  } catch(err) {
    console.error('GET /test-batch/student/:roll_no error:',err);
    res.status(500).json({error:'Failed to fetch Test Batch student dashboard'});
  }
});

/* =========================================================
	SERVER START
	========================================================= */
const PORT = process.env.PORT || 5050;

app.listen(PORT, '0.0.0.0', () => {
	console.log(`Server running on port ${PORT}`);
});
