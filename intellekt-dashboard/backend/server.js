const express = require('express');
const cors = require('cors');
const pool = require('./db');
const registerRecordEditRoutes = require('./record_edit_requests');
const registerTestBatchEditRequestRoutes = require('./test_batch_edit_requests');
const crypto = require("node:crypto");
const { makeEventKey, queueNotificationEvent } = require('./web-notification-outbox');
const { sendToStudent } = require('./student-notification-service');
const { createTestBatchPushWorker } = require('./test-batch-push-worker');
const app = express();

const {
	createFacultyNotification
} = require('./faculty-notification-service');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/* =========================================================
	HELPERS
========================================================= */
function normalizeTestBatchBoard(value) {
	const board = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
	if (board === 's' || board === 'state' || board === 'stateboard') return 'stateboard';
	if (board === 'c' || board === 'cbse') return 'cbse';
	if (board === 'i' || board === 'isc' || board === 'icse') return 'isc';
	return board;
}

function parseRegularTestCode(testCode) {
	const raw = String(testCode || '').trim();
	const attemptMatch = raw.match(/\s+TEST\s*(\d+)$/i);
	const attempt = attemptMatch ? Number(attemptMatch[1]) : null;
	const base = attemptMatch ? raw.slice(0, attemptMatch.index).trim() : raw;
	const match = base.match(/^([SCI])(7|8|9|10|11|12)(M|P)(\d{1,3})C(.+)$/i);
	if (!match) return null;
	const [, boardCode, classCode, subjectCodeRaw, marksCode, chapterRaw] = match;
	const subjectCode = subjectCodeRaw.toUpperCase();
	const subjectName = subjectCode === 'M' ? 'Mathematics' : 'Physics';
	const chapter = String(chapterRaw || '').trim();
	if (!chapter || Number(marksCode) <= 0) return null;
	return {
		boardCode: boardCode.toUpperCase(),
		board: boardCode.toUpperCase() === 'S' ? 'State Board' : boardCode.toUpperCase() === 'C' ? 'CBSE' : 'ISC',
		className: classCode,
		subjectCode,
		subjectName,
		totalMarks: Number(marksCode),
		chapter,
		attempt,
		canonicalCode: raw.toUpperCase().replace(/\s+/g, ' ')
	};
}

function parseTestBatchCode(testCode) {
	const code = String(testCode || '').trim().toUpperCase().replace(/\s+/g, '');

	// Board, class, subject and marks are encoded before the test-code suffix.
	// Two-digit marks remain unchanged; 106 and 140 are supported as three-digit values.
	// Any suffix after the encoded marks must not affect eligibility matching.
	// Examples: S12P70FT1 -> S12P70, S12M106C01 -> S12M106
	const match = code.match(/^([SCI])(\d{2})([MP])(106|140|\d{2})(?!\d)/);

	if (!match) return null;

	const [, boardCode, classCode, subjectCode, marksCode] = match;

	return {
		board:
			boardCode === 'S'
				? 'State Board'
				: boardCode === 'C'
					? 'CBSE'
					: 'ISC',
		className: classCode,
		subject: subjectCode === 'M' ? 'Mathematics' : 'Physics',
		totalMarks: Number(marksCode),
		baseCode: code.slice(0, match[0].length)
	};
}

function formatTestBatchRegistrationDateTime(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value || '');
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Asia/Kolkata',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h12'
	}).formatToParts(date).reduce((result, part) => {
		result[part.type] = part.value;
		return result;
	}, {});
	return `${parts.day}/${parts.month}/${parts.year} at ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

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

function getTestBatchSlots(durationMinutes, dateStr) {
  const duration = Number(durationMinutes);
  const sunday = new Date(String(dateStr) + 'T00:00:00').getDay() === 0;

  if (duration === 90) {
    return sunday
      ? [
          { start: '07:00', end: '08:30' },
          { start: '08:30', end: '10:00' },
          { start: '10:00', end: '11:30' },
          { start: '11:30', end: '13:00' }
        ]
      : [
          { start: '17:30', end: '19:00' },
          { start: '19:00', end: '20:30' }
        ];
  }

  if (duration === 180) {
    return sunday
      ? [
          { start: '07:00', end: '10:00' },
          { start: '10:00', end: '13:00' }
        ]
      : [
          { start: '17:30', end: '20:30' }
        ];
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

		if (prefix === 'IA' || /^\d{2}IA/.test(idUpper)) {
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
        await ensureRecordAuditSchema();
		const result = await pool.query(
			`
				SELECT roll_no, subject_id, attendance_date, status, updated_by, updated_by_name, marked_at, edited_by, edited_by_name, edited_at
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
        m.entered_by, m.entered_by_name, m.entered_at,
        m.updated_by, m.updated_by_name, m.updated_at,
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

    const rows = result.rows.map((row) => {
      const parsed = parseRegularTestCode(row.test_code);
      if (!parsed) return row;
      return {
        ...row,
        subject_name: parsed.subjectName,
        chapter: parsed.chapter,
        total_marks: row.total_marks || parsed.totalMarks,
        attempt: parsed.attempt
      };
    });
    res.json(rows);
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
// Automatically archive read notifications after 30 days.
app.get('/faculty-notifications/:facultyId/archived', async (req, res) => {
	const { facultyId } = req.params;
	try {
		const result = await pool.query(
			`
				SELECT *
				FROM faculty_notifications
				WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM($1))
				  AND archived_at IS NOT NULL
				ORDER BY archived_at DESC, created_at DESC
				`,
			[facultyId]
		);
		res.json(result.rows);
	} catch (err) {
		console.error('GET archived faculty notifications error:', err);
		res.status(500).json({ error: 'Failed to fetch archived notifications' });
	}
});

app.get('/faculty-notifications/:facultyId', async (req, res) => {
	const { facultyId } = req.params;
	try {
		await pool.query(
			`
				UPDATE faculty_notifications
				SET archived_at = created_at + INTERVAL '30 days'
				WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM($1))
				  AND is_read = TRUE
				  AND archived_at IS NULL
				  AND created_at <= NOW() - INTERVAL '30 days'
				`,
			[facultyId]
		);
		const result = await pool.query(
			`
				SELECT *
				FROM faculty_notifications
				WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM($1))
			  AND archived_at IS NULL
				ORDER BY created_at DESC
				`,
			[facultyId]
		);
		res.json(result.rows);
	} catch (err) {
		console.error('GET faculty notifications error:', err);
		res.status(500).json({ error: 'Failed to fetch faculty notifications' });
	}
});

app.put('/faculty-notifications/read/:facultyId/:notificationId', async (req, res) => {
	const { facultyId, notificationId } = req.params;
	try {
		const result = await pool.query(
			`
				UPDATE faculty_notifications
				SET is_read = TRUE
				WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM($1))
				  AND id = $2
				  AND archived_at IS NULL
				RETURNING id
				`,
			[facultyId, notificationId]
		);
		if (!result.rowCount) {
			return res.status(404).json({ error: 'Notification not found' });
		}
		res.json({ message: 'Notification marked as read' });
	} catch (err) {
		console.error('PUT faculty notification read error:', err);
		res.status(500).json({ error: 'Failed to mark notification as read' });
	}
});

app.put('/faculty-notifications/read-all/:facultyId', async (req, res) => {
	const { facultyId } = req.params;
	try {
		const result = await pool.query(
			`
				UPDATE faculty_notifications
				SET is_read = TRUE
				WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM($1))
				  AND archived_at IS NULL
				  AND is_read = FALSE
				`,
			[facultyId]
		);
		res.json({ message: 'All notifications marked as read', updated: result.rowCount || 0 });
	} catch (err) {
		console.error('PUT faculty notifications read-all error:', err);
		res.status(500).json({ error: 'Failed to mark all notifications as read' });
	}
});

app.put('/faculty-notifications/archive-all/:facultyId', async (req, res) => {
	const { facultyId } = req.params;
	try {
		const result = await pool.query(
			`
				UPDATE faculty_notifications
				SET archived_at = NOW()
				WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM($1))
				  AND archived_at IS NULL
				RETURNING id
				`,
			[facultyId]
		);
		res.json({ message: 'Notifications moved to archive', archived: result.rowCount || 0 });
	} catch (err) {
		console.error('PUT faculty notifications archive-all error:', err);
		res.status(500).json({ error: 'Failed to archive notifications' });
	}
});

app.put('/faculty-notifications/restore/:facultyId/:notificationId', async (req, res) => {
	const { facultyId, notificationId } = req.params;
	try {
		const result = await pool.query(
			`
				UPDATE faculty_notifications
				SET archived_at = NULL
				WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM($1))
				  AND id = $2
				  AND archived_at IS NOT NULL
				RETURNING id
				`,
			[facultyId, notificationId]
		);
		if (!result.rowCount) {
			// Make restore idempotent: if this notification already belongs to
			// the faculty member and is active, the requested end state is met.
			const existing = await pool.query(
				`
					SELECT id
					FROM faculty_notifications
					WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM($1))
					  AND id = $2
					  AND archived_at IS NULL
					LIMIT 1
				`,
				[facultyId, notificationId]
			);
			if (!existing.rowCount) {
				return res.status(404).json({ error: 'Archived notification not found' });
			}
			return res.json({ message: 'Notification already restored' });
		}
		res.json({ message: 'Notification restored' });
	} catch (err) {
		console.error('PUT faculty notification restore error:', err);
		res.status(500).json({ error: 'Failed to restore notification' });
	}
});

// Keep the legacy module-level endpoint for existing clients.
app.put('/faculty-notifications/mark-read/:facultyId/:moduleName', async (req, res) => {
	try {
		const { facultyId, moduleName } = req.params;
		await pool.query(
			`
			UPDATE faculty_notifications
			SET is_read = TRUE
			WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM($1))
			  AND module_name = $2
			  AND archived_at IS NULL
			`,
			[facultyId, moduleName]
		);
		res.json({ message: 'Notifications marked as read' });
	} catch (err) {
		console.error('PUT /faculty-notifications/mark-read error:', err);
		res.status(500).json({ error: 'Failed to mark notifications as read' });
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
app.post('/marks', requireRecordAuditActor, async (req, res) => {
	const { records } = req.body || {};
	if (!Array.isArray(records) || records.length === 0) {
		return res.status(400).json({ error: 'records are required' });
	}
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const queuedGroups = new Map();
		for (const record of records) {
			if (record.marks === undefined || record.marks === null || record.marks === '') continue;
			const rollNo = String(record.roll_no || '').trim();
			const testCode = String(record.test_code || '').trim().toUpperCase();
			const cleanMarks = String(record.marks).trim().toUpperCase();
			if (!rollNo || !testCode) throw Object.assign(new Error('roll_no and test_code are required'), { statusCode: 400 });
			const parsed = record.batch === 'Regular Batch' ? parseRegularTestCode(testCode) : null;
			let subjectId = null;
			let totalMarks = Number(record.total_marks);
			let canonicalCode = testCode;
			const studentResult = await client.query(
				'SELECT roll_no, name, class, board, batch FROM students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) LIMIT 1',
				[rollNo]
			);
			if (!studentResult.rows.length) throw Object.assign(new Error('Student not found: ' + rollNo), { statusCode: 400 });
			const student = studentResult.rows[0];
			if (parsed) {
				if (student.batch && String(student.batch).trim().toLowerCase() !== 'regular batch') {
					throw Object.assign(new Error('Manual test-code marks are only for Regular Batch students.'), { statusCode: 400 });
				}
				if (String(student.class).trim() !== parsed.className ||
					normalizeTestBatchBoard(student.board) !== normalizeTestBatchBoard(parsed.board)) {
					throw Object.assign(new Error('Student ' + rollNo + ' does not match the class and board in test code ' + testCode), { statusCode: 400 });
				}
				if (totalMarks !== parsed.totalMarks) {
					throw Object.assign(new Error('Total marks must match the test code (' + parsed.totalMarks + ').'), { statusCode: 400 });
				}
				const aliases = parsed.subjectCode === 'M' ? ['mathematics', 'maths', 'math'] : ['physics', 'phy'];
				const subjectResult = await client.query(
					'SELECT subject_id FROM subjects WHERE LOWER(TRIM(subject_name)) = ANY($1::text[]) LIMIT 1',
					[aliases]
				);
				if (!subjectResult.rows.length) throw Object.assign(new Error('Subject is not configured.'), { statusCode: 400 });
				subjectId = subjectResult.rows[0].subject_id;
				const enrollment = await client.query(
					'SELECT 1 FROM student_subjects WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) AND subject_id = $2 LIMIT 1',
					[student.roll_no, subjectId]
				);
				if (!enrollment.rows.length) throw Object.assign(new Error('Student ' + rollNo + ' is not enrolled in ' + parsed.subjectName + '.'), { statusCode: 400 });
				canonicalCode = parsed.canonicalCode;
			} else {
				const testResult = await client.query(
					'SELECT test_code, subject_id, total_marks FROM tests WHERE UPPER(TRIM(test_code)) = UPPER(TRIM($1))',
					[testCode]
				);
				if (!testResult.rows.length) throw Object.assign(new Error('Invalid test code: ' + testCode), { statusCode: 400 });
				subjectId = testResult.rows[0].subject_id;
				totalMarks = Number(testResult.rows[0].total_marks);
				const eligible = await client.query(
					'SELECT 1 FROM student_subjects WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) AND subject_id = $2 LIMIT 1',
					[student.roll_no, subjectId]
				);
				if (!eligible.rows.length) throw Object.assign(new Error(rollNo + ' is not eligible for this test subject'), { statusCode: 400 });
			}
			if (record.batch === 'Regular Batch' && parsed) {
				await client.query(
					`INSERT INTO tests (test_code, test_date, subject_id, total_marks, portion, class, board)
						 SELECT $1::text, $2, $3, $4, $5, $6, $7
						 WHERE NOT EXISTS (SELECT 1 FROM tests WHERE UPPER(TRIM(test_code)) = UPPER(TRIM($1::text)))`,
						[canonicalCode, record.test_date || null, subjectId, totalMarks, record.portion || null, student.class, student.board]
				);
			}
			if (cleanMarks !== 'A') {
				const obtained = Number(cleanMarks);
				if (!Number.isInteger(obtained) || obtained < 0 || obtained > totalMarks) {
					throw Object.assign(new Error('Marks for ' + rollNo + ' must be between 0 and ' + totalMarks + ', or A for absent'), { statusCode: 400 });
				}
			}
			await client.query(
				`INSERT INTO marks (roll_no, student_name, test_code, marks_obtained, comments, total_marks, entered_by, entered_by_name, entered_at, updated_by, updated_by_name, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$7,$8,CURRENT_TIMESTAMP)
         ON CONFLICT (roll_no, test_code) DO NOTHING`,
				[student.roll_no, student.name, canonicalCode, cleanMarks, cleanMarks === 'A' ? 'Absent' : (record.comments || null), totalMarks, req.recordAuditActor.id, req.recordAuditActor.name]
			);
			await client.query(
				"DELETE FROM student_notifications WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) AND module_name = 'marks'",
				[student.roll_no]
			);
			await client.query(
				"INSERT INTO student_notifications (roll_no, module_name, message, is_read) VALUES ($1, 'marks', 'New marks have been uploaded', FALSE)",
				[student.roll_no]
			);
			const eventKey = makeEventKey('marks', canonicalCode, student.class, student.board);
			queuedGroups.set(eventKey, {
				eventKey, moduleName: 'marks', className: student.class, board: student.board,
				subjectId: subjectId ? Number(subjectId) : null, title: 'Marks posted',
				message: 'Marks for ' + canonicalCode + ' have been posted',
				payload: { test_code: canonicalCode, total_marks: totalMarks }
			});
		}
		let notificationQueued = false;
		for (const event of queuedGroups.values()) {
			const queued = await queueNotificationEvent(client, event);
			notificationQueued = notificationQueued || queued.queued;
		}
		await client.query('COMMIT');
		return res.json({ message: 'Marks saved successfully', notificationQueued });
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('POST /marks error:', err);
		return res.status(err.statusCode || 500).json({
			error: err.statusCode ? err.message : 'Marks save failed',
			...(err.statusCode ? {} : { details: err.message })
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
        m.entered_by, m.entered_by_name, m.entered_at,
        m.updated_by, m.updated_by_name, m.updated_at,
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
app.put('/marks/:roll_no/:test_code', requireRecordAuditActor, async (req, res) => {
  const editorId = String(req.get('x-admin-id') || req.body?.adminId || '').trim().toUpperCase();
  if (!['IG001', 'IG002'].includes(editorId)) {
    return res.status(403).json({ error: 'Faculty must obtain admin approval before editing marks.' });
  }
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
        comments = $2,
        updated_by = $5,
        updated_by_name = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($3))
      AND UPPER(TRIM(test_code)) = UPPER(TRIM($4))
			`,
			[
				cleanMarks,
        newComment,
        roll_no,
        test_code,
        req.recordAuditActor.id,
        req.recordAuditActor.name
			]
		);

		res.json({ message: 'Marks updated successfully' });
	} catch (err) {
		console.error('PUT /marks/:roll_no/:test_code error:', err);
		res.status(500).json({ error: 'Failed to update marks' });
	}
});
app.put('/update-marks', requireRecordAuditActor, async (req, res) => {
  if (!['IG001','IG002'].includes(req.recordAuditActor.id)) {
    return res.status(403).json({ error: 'Faculty must obtain admin approval before editing marks.' });
  }
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
			SET marks_obtained = $1,
        updated_by = $4,
        updated_by_name = $5,
        updated_at = CURRENT_TIMESTAMP
      FROM students
			WHERE marks.roll_no = students.roll_no
			AND students.name = $2
			AND UPPER(TRIM(marks.test_code)) = UPPER(TRIM($3))
			`,
			[ obtainedMarks, name, test_code, req.recordAuditActor.id, req.recordAuditActor.name ]
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
        await ensureRecordAuditSchema();
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
                        a.updated_by, a.updated_by_name,
                        a.marked_at,
                        a.edited_by, a.edited_by_name,
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
                        a.updated_by, a.updated_by_name,
                        a.marked_at,
                        a.edited_by, a.edited_by_name,
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
                    updated_by, updated_by_name,
                    marked_at,
                    edited_by, edited_by_name,
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

app.post('/attendance', requireRecordAuditActor, async (req, res) => {
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

	if (overwrite && !['IG001', 'IG002'].includes(String(facultyId).trim().toUpperCase())) {
		return res.status(403).json({ error: 'Faculty must obtain admin approval before editing existing attendance.' });
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
              updated_by_name = $3,
              attendance_time = CURRENT_TIME,
              marked_at = COALESCE(marked_at, CURRENT_TIMESTAMP),
              edited_by = $2,
              edited_by_name = $3,
              edited_at = CURRENT_TIMESTAMP
            WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($4))
            AND subject_id = $5
            AND attendance_date = $6
						`,
						[record.status, req.recordAuditActor.id, req.recordAuditActor.name, record.roll_no, subject, selectedDate]
					);
				}
			} else {
				await client.query(
					`
					INSERT INTO attendance
						(roll_no, subject_id, attendance_date, attendance_time, status, updated_by, updated_by_name, marked_at)
          VALUES ($1,$2,$3,CURRENT_TIME,$4,$5,$6,CURRENT_TIMESTAMP)
					`,
					[record.roll_no, subject, selectedDate, record.status, req.recordAuditActor.id, req.recordAuditActor.name]
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
app.put('/attendance', requireRecordAuditActor, async (req, res) => {
  const editorId = String(req.get('x-admin-id') || req.body?.adminId || '').trim().toUpperCase();
  if (!['IG001', 'IG002'].includes(editorId)) {
    return res.status(403).json({ error: 'Faculty must obtain admin approval before editing attendance.' });
  }
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
          updated_by = $2,
          updated_by_name = $3,
          edited_by = $2,
          edited_by_name = $3,
          edited_at = CURRENT_TIMESTAMP
				WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($4))
        AND subject_id = $5
        AND attendance_date = $6
        RETURNING *
				`,
				[record.status, req.recordAuditActor.id, req.recordAuditActor.name, record.roll_no, subject, selectedDate]
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
		const editorId = String(req.body?.created_by || '').trim().toUpperCase();
		if (!['IG001', 'IG002'].includes(editorId)) {
			return res.status(403).json({ error: 'Faculty must receive admin approval before editing a posted test.' });
		}
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
	
// Return the enrolled-student count directly from the relevant student table.
app.get('/student-count', async (req, res) => {
  const { class: className, board, batch } = req.query;
  const normalizedBatch = String(batch || '').trim().toLowerCase();

  if (!className || !board || !['regular batch', 'test batch'].includes(normalizedBatch)) {
    return res.status(400).json({ error: 'class, board and a valid batch are required' });
  }

  try {
    const result = normalizedBatch === 'test batch'
      ? await pool.query(
          `SELECT
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE subjects IN ('Mathematics', 'Both'))::int AS mathematics_count,
             COUNT(*) FILTER (WHERE subjects IN ('Physics', 'Both'))::int AS physics_count,
             COUNT(*) FILTER (WHERE subjects = 'Both')::int AS both_count
           FROM test_batch_students
           WHERE UPPER(TRIM(class)) = UPPER(TRIM($1))
             AND UPPER(REGEXP_REPLACE(TRIM(board), '\\s+', '', 'g')) =
                 UPPER(REGEXP_REPLACE(TRIM($2), '\\s+', '', 'g'))`,
          [className, board]
        )
      : await pool.query(
          `WITH matched_students AS (
             SELECT s.roll_no
             FROM students s
             WHERE UPPER(TRIM(s.class)) = UPPER(TRIM($1))
               AND UPPER(REGEXP_REPLACE(TRIM(s.board), '\\s+', '', 'g')) =
                   UPPER(REGEXP_REPLACE(TRIM($2), '\\s+', '', 'g'))
               AND LOWER(TRIM(COALESCE(s.batch, ''))) = 'regular batch'
           ),
           subject_flags AS (
             SELECT
               ms.roll_no,
               BOOL_OR(LOWER(TRIM(sub.subject_name)) IN ('mathematics', 'maths')) AS has_mathematics,
               BOOL_OR(LOWER(TRIM(sub.subject_name)) = 'physics') AS has_physics
             FROM matched_students ms
             JOIN student_subjects ss
               ON UPPER(TRIM(ss.roll_no)) = UPPER(TRIM(ms.roll_no))
             JOIN subjects sub ON sub.subject_id = ss.subject_id
             GROUP BY ms.roll_no
           )
           SELECT
             (SELECT COUNT(*)::int FROM matched_students) AS count,
             COUNT(*) FILTER (WHERE has_mathematics)::int AS mathematics_count,
             COUNT(*) FILTER (WHERE has_physics)::int AS physics_count,
             COUNT(*) FILTER (WHERE has_mathematics AND has_physics)::int AS both_count
           FROM subject_flags`,
          [className, board]
        );

    const counts = result.rows[0] || {};
    return res.json({
      count: Number(counts.count || 0),
      subject_counts: {
        mathematics: Number(counts.mathematics_count || 0),
        physics: Number(counts.physics_count || 0),
        both: Number(counts.both_count || 0),
      },
      batch: normalizedBatch === 'test batch' ? 'Test Batch' : 'Regular Batch',
      class: String(className).trim(),
      board: String(board).trim(),
    });
  } catch (err) {
    console.error('GET /student-count error:', err);
    return res.status(500).json({ error: 'Failed to fetch enrolled student count' });
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
        s.date_of_birth,
        s.batch,
        s.academic_year_from,
        s.academic_year_to,
        s.parent_name,
        s.secondary_contact,
        s.reference
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
      query += ` AND UPPER(REGEXP_REPLACE(TRIM(s.board), '\\s+', '', 'g')) = UPPER(REGEXP_REPLACE(TRIM($${values.length}), '\\s+', '', 'g'))`;
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
app.get('/students/:value', async (req, res) => {
	const { value } = req.params;
	const upperValue = String(value).toUpperCase();

	try {
		const matchingRoll = await pool.query(
			`SELECT 1 FROM students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) LIMIT 1`,
			[value]
		);

		// Look up existing students by their actual roll number, regardless of format.
		if (matchingRoll.rows.length > 0) {
			const studentResult = await pool.query(
				`
			SELECT 
			s.roll_no,
			s.name,
			s.class,
			s.board,
			s.phone,
			s.email,
			s.school_name,
			s.password,
			s.date_of_birth,
			s.batch,
			s.academic_year_from,
			s.academic_year_to,
			s.parent_name,
			s.secondary_contact,
			s.reference,
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
app.post('/students', async (req, res) => {
	const client = await pool.connect();

	try {
		const {
			enquiry_id,
			admission_token,
			roll_no,
			name,
			class: className,
			board,
			phone,
			email,
			school_name,
			password,
			date_of_birth,
			batch,
			test_writing_day,
			academic_year_from,
			academic_year_to,
			parent_name,
			secondary_contact,
			reference,
			subject_ids,
			total_fee,
			fee_paid,
			next_due
		} = req.body;

		const cleanRollNo = String(roll_no || '').trim();
		if (!cleanRollNo) {
			return res.status(400).json({ error: 'Roll number is required' });
		}

		if (!name || !className || !board || !phone || !email || !school_name) {
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

		if (enquiry_id) {
			const admissionLock = await client.query(
				`SELECT id FROM enquiries
				 WHERE id=$1 AND status IN ('Pending','Admission In Progress') AND admission_token=$2
				 FOR UPDATE`,
				[enquiry_id, String(admission_token || '')]
			);
			if (!admissionLock.rows.length) {
				await client.query('ROLLBACK');
				return res.status(409).json({ error: 'This admission session expired or is no longer active. Reopen the enquiry and try again.' });
			}
		}

		const duplicateRoll = await client.query(
			'SELECT 1 FROM students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) LIMIT 1',
			[cleanRollNo]
		);
		if (duplicateRoll.rows.length > 0) {
			await client.query('ROLLBACK');
			return res.status(409).json({ error: 'This roll number already exists. Please enter a different roll number.' });
		}

		const newRoll = cleanRollNo;
		const finalPassword = password && String(password).trim() !== '' ? String(password).trim() : newRoll;

		await client.query(
			`
		INSERT INTO students (
			roll_no,
			name,
			class,
			board,
			phone,
			email,
			school_name,
			password,
			date_of_birth,
			batch,
			test_writing_day,
			academic_year_from,
			academic_year_to,
			parent_name,
			secondary_contact,
			reference
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		`,
			[
				newRoll,
				String(name).trim(),
				String(className).trim(),
				String(board).trim(),
				String(phone).trim(),
				String(email).trim(),
				String(school_name).trim(),
				finalPassword,
				date_of_birth || null,
				batch || 'Regular Batch',
				(batch || 'Regular Batch') === 'Regular Batch' && ['Sunday', 'Monday', 'Tuesday'].includes(test_writing_day) ? test_writing_day : null,
				academic_year_from || null,
				academic_year_to || null,
				parent_name || null,
				secondary_contact || null,
				reference || null
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

		if (enquiry_id) {
			const admitted = await client.query(
				`UPDATE enquiries
				 SET status='Admitted', admission_token=NULL, admission_started_at=NULL
				 WHERE id=$1 AND status IN ('Pending','Admission In Progress') AND admission_token=$2
				 RETURNING id`,
				[enquiry_id, String(admission_token || '')]
			);
			if (!admitted.rows.length) {
				await client.query('ROLLBACK');
				return res.status(409).json({ error: 'Admission session changed before the student could be saved. No student was created; please reopen the enquiry.' });
			}
			await client.query('DELETE FROM enquiry_admission_drafts WHERE enquiry_id=$1', [enquiry_id]);
		}

		await client.query('COMMIT');

		res.status(201).json({
			message: 'Student added successfully',
			roll_no: newRoll,
			admitted_enquiry_id: enquiry_id || null
		});
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('POST /students error:', err);

		if (err.code === '23505') {
			return res.status(409).json({
				error: 'This roll number or another unique student field already exists. Please check the details and try again.'
			});
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
			phone,
			email,
			school_name,
			password,
			date_of_birth,
			batch,
			academic_year_from,
			academic_year_to,
			parent_name,
			secondary_contact,
			reference,
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

			// Subject mappings reference students.roll_no with a foreign key.
			// Remove the old mappings inside this transaction; the selected subjects
			// are validated and reinserted under the new roll number after the student update.
			await client.query(`DELETE FROM student_subjects WHERE roll_no = $1`, [ oldRollNo ]);
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
			phone = $5,
			email = $6,
			school_name = $7,
			password = $8,
			date_of_birth = $9,
			batch = $10,
			academic_year_from = $11,
			academic_year_to = $12,
			parent_name = $13,
			secondary_contact = $14,
			reference = $15
		WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($16))
		`,
			[
				newRollNo,
				String(name).trim(),
				String(className).trim(),
				String(board).trim(),
				String(phone).trim(),
				String(email).trim(),
				String(school_name).trim(),
				String(password).trim(),
				date_of_birth || null,
				batch || 'Regular Batch',
				academic_year_from || null,
				academic_year_to || null,
				parent_name || null,
				secondary_contact || null,
				reference || null,
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
	const client = await pool.connect();
	const createdTasks = [];
	try {
		// Serialize this worker with API-triggered calls so only one daily
		// instance (and one notification) is created for each template/date.
		await client.query('SELECT pg_advisory_lock($1)', [73190421]);
		const todayResult = await client.query(
			"SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date::text AS today"
		);
		const today = todayResult.rows[0].today;
		const templates = await client.query(`
			SELECT *
			FROM faculty_tasks
			WHERE task_type = 'Daily'
			  AND parent_daily_task_id IS NULL
			ORDER BY id
		`);

		for (const template of templates.rows) {
			const inserted = await client.query(
				`
					INSERT INTO faculty_tasks (
						faculty_id, faculty_name, class_name, subject_name, test_code,
						total_test_note, other_tasks, due_date, priority, assigned_by,
						task_type, parent_daily_task_id, task_date, is_completed, completed_at
					)
					SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Daily',$11,$12,FALSE,NULL
					WHERE NOT EXISTS (
						SELECT 1 FROM faculty_tasks
						WHERE parent_daily_task_id = $11 AND task_date = $12
					)
					RETURNING id, faculty_id, faculty_name, task_date
				`,
				[
					template.faculty_id,
					template.faculty_name,
					template.class_name,
					template.subject_name || '',
					template.test_code || '',
					template.total_test_note || '',
					template.other_tasks || '',
					today,
					template.priority || 'High',
					template.assigned_by,
					template.id,
					today
				]
			);
			if (inserted.rowCount > 0) createdTasks.push(inserted.rows[0]);
		}
	} finally {
		try { await client.query('SELECT pg_advisory_unlock($1)', [73190421]); }
		catch (unlockError) { console.error('[Faculty Tasks] Failed to release daily-task lock:', unlockError.message); }
		client.release();
	}

	// Notify only after a new daily instance has actually been inserted.
	for (const task of createdTasks) {
		try {
			await createFacultyNotification(pool, {
				facultyId: task.faculty_id,
				moduleName: 'tasks',
				title: 'Daily task reminder',
				message: 'Your daily task is ready for today',
				data: { task_id: task.id, task_type: 'Daily' }
			});
		} catch (notificationError) {
			console.error('[Faculty Tasks] Daily task notification failed:', {
				taskId: task.id, facultyId: task.faculty_id,
				message: notificationError.message
			});
		}
	}
	return createdTasks.length;
}

// Send one overdue alert per task to each admin. The unique key in the
// notification ledger prevents duplicate alerts across scheduler restarts.
async function notifyAdminsAboutOverdueTasks() {
	const overdue = await pool.query(`
		SELECT id, faculty_id, faculty_name, class_name, subject_name, due_date
		FROM faculty_tasks
		WHERE COALESCE(is_completed, FALSE) = FALSE
		  AND due_date IS NOT NULL
		  AND due_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
		  AND (task_type = 'Weekly' OR task_type = 'Daily' OR task_type IS NULL)
		ORDER BY due_date ASC, id ASC
		LIMIT 500
	`);

	let notificationsCreated = 0;
	for (const task of overdue.rows) {
		for (const adminId of ['IG001', 'IG002']) {
			const claimed = await pool.query(`
				INSERT INTO faculty_task_overdue_notifications (task_id, admin_id)
				VALUES ($1, $2)
				ON CONFLICT (task_id, admin_id) DO NOTHING
				RETURNING task_id
			`, [task.id, adminId]);
			if (!claimed.rowCount) continue;

			try {
				await createFacultyNotification(pool, {
					facultyId: adminId,
					moduleName: 'tasks',
					title: 'Overdue faculty task',
					message: `${task.faculty_name} has not completed the task due on ${String(task.due_date).slice(0, 10)}`,
					data: {
						task_id: task.id,
						faculty_id: task.faculty_id,
						task_type: 'overdue'
					}
				});
				notificationsCreated++;
			} catch (notificationError) {
				// Allow a later scheduler pass to retry if the notification failed.
				await pool.query(
					'DELETE FROM faculty_task_overdue_notifications WHERE task_id=$1 AND admin_id=$2',
					[task.id, adminId]
				);
				console.error('[Faculty Tasks] Overdue notification failed:', {
					taskId: task.id, adminId, message: notificationError.message
				});
			}
		}
	}
	return notificationsCreated;
}

async function runFacultyTaskNotificationJobs() {
	try {
		const dailyCreated = await ensureDailyTasksForToday();
		if (dailyCreated) console.log(`[Faculty Tasks] Created ${dailyCreated} daily task instance(s)`);
	} catch (error) {
		console.error('[Faculty Tasks] Daily task generation failed:', error);
	}
	try {
		const overdueSent = await notifyAdminsAboutOverdueTasks();
		if (overdueSent) console.log(`[Faculty Tasks] Sent ${overdueSent} overdue admin notification(s)`);
	} catch (error) {
		console.error('[Faculty Tasks] Overdue notification check failed:', error);
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
					test_code,
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
					test_code,
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
					test_code,
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
		test_code,
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

		if (!subject_name || !['Maths', 'Physics', 'Other'].includes(String(subject_name).trim())) {
			return res.status(400).json({
				error: 'Please select a valid subject (Maths, Physics or Other)'
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
						test_code,
						total_test_note,
						other_tasks,
						due_date,
						priority,
						assigned_by,
						task_type,
						parent_daily_task_id,
						task_date
					)
					VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,'Daily',NULL,NULL)
					RETURNING *
				`,
				[
					faculty_id,
					faculty_name,
					class_name,
					subject_name,
					test_code || '',
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
						test_code,
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
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Daily',$11,$12,FALSE,NULL)
					RETURNING *
				`,
				[
					faculty_id,
					faculty_name,
					class_name,
					subject_name,
					test_code || '',
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
					test_code,
					total_test_note,
					other_tasks,
					due_date,
					priority,
					assigned_by,
					task_type,
					parent_daily_task_id,
					task_date
				)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Weekly',NULL,NULL)
				RETURNING *
			`,
			[
				faculty_id,
				faculty_name,
				class_name,
				subject_name,
				test_code || '',
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

		if (req.body.action === 'edit') {
			const {
				loginFacultyId,
				faculty_name: editedFacultyName,
				faculty_id: editedFacultyId,
				class_name,
				subject_name,
				test_code,
				total_test_note,
				other_tasks,
				due_date,
				priority,
				task_type
			} = req.body;

			if (!['IG001', 'IG002'].includes(String(loginFacultyId || '').trim().toUpperCase())) {
				return res.status(403).json({ error: 'Only admins can edit assigned tasks' });
			}
			if (!editedFacultyId || !editedFacultyName || !class_name ||
				!['Maths', 'Physics', 'Other'].includes(String(subject_name || '').trim())) {
				return res.status(400).json({ error: 'Faculty, class and a valid subject are required' });
			}
			if (task_type !== 'Daily' && !due_date) {
				return res.status(400).json({ error: 'Due date is required for weekly tasks' });
			}

			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				const current = await client.query(
					'SELECT id, task_type, parent_daily_task_id FROM faculty_tasks WHERE id=$1 FOR UPDATE',
					[id]
				);
				if (!current.rows.length) {
					await client.query('ROLLBACK');
					return res.status(404).json({ error: 'Task not found' });
				}
				const task = current.rows[0];
				const targetId = task.parent_daily_task_id || task.id;
				const values = [
					editedFacultyId.trim().toUpperCase(), editedFacultyName, class_name,
					subject_name, test_code || '', total_test_note || '', other_tasks || '',
					task_type === 'Daily' ? null : due_date,
					task_type === 'Daily' ? 'High' : (priority || 'Medium'), targetId
				];
				await client.query(
					`UPDATE faculty_tasks
						 SET faculty_id=$1, faculty_name=$2, class_name=$3, subject_name=$4,
						     test_code=$5, total_test_note=$6, other_tasks=$7,
						     due_date=CASE
						       WHEN task_type='Daily' AND parent_daily_task_id IS NOT NULL
						         THEN (NOW() AT TIME ZONE 'Asia/Kolkata')::date
						       ELSE $8
						     END,
						     priority=$9
						 WHERE id=$10 OR parent_daily_task_id=$10`,
					values
				);
				await client.query('COMMIT');
				result = await pool.query('SELECT * FROM faculty_tasks WHERE id=$1', [id]);
			} catch (editError) {
				await client.query('ROLLBACK');
				throw editError;
			} finally {
				client.release();
			}
		} else if (faculty_id && faculty_name) {
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
app.get('/enquiries/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id,enq_id,student_name,mobile_number,class_board,school_name,subjects,
              academic_year_from,academic_year_to,batch,date_of_birth,parent_name,
              secondary_contact,reference,status,comment,reason,created_at,admission_started_at
       FROM enquiries WHERE id=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Enquiry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /enquiries/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch enquiry' });
  }
});

// Persistent admission drafts are independent of the short-lived admission session token.
app.get('/enquiries/:id/admission/draft', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT draft_data, updated_at FROM enquiry_admission_drafts WHERE enquiry_id=$1',
      [req.params.id]
    );
    res.json(result.rows[0] || { draft_data: null, updated_at: null });
  } catch (err) {
    console.error('GET admission draft error:', err);
    res.status(500).json({ error: 'Failed to load admission draft' });
  }
});

app.put('/enquiries/:id/admission/draft', async (req, res) => {
  const draft = req.body?.draft_data;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    return res.status(400).json({ error: 'A valid admission draft is required' });
  }
  try {
    const enquiry = await pool.query('SELECT id, status FROM enquiries WHERE id=$1', [req.params.id]);
    if (!enquiry.rows.length) return res.status(404).json({ error: 'Enquiry not found' });
    if (enquiry.rows[0].status === 'Admitted') {
      return res.status(409).json({ error: 'This enquiry is already admitted; its draft can no longer be changed.' });
    }
    const safeDraft = { ...draft };
    if (safeDraft.fields && typeof safeDraft.fields === 'object') {
      safeDraft.fields = { ...safeDraft.fields };
      delete safeDraft.fields.password;
    }
    const result = await pool.query(
      `INSERT INTO enquiry_admission_drafts (enquiry_id, draft_data, updated_at)
       VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (enquiry_id) DO UPDATE
       SET draft_data=EXCLUDED.draft_data, updated_at=CURRENT_TIMESTAMP
       RETURNING updated_at`,
      [req.params.id, JSON.stringify(safeDraft)]
    );
    res.json({ success: true, updated_at: result.rows[0].updated_at });
  } catch (err) {
    console.error('PUT admission draft error:', err);
    res.status(500).json({ error: 'Failed to save admission draft' });
  }
});

app.delete('/enquiries/:id/admission/draft', async (req, res) => {
  try {
    await pool.query('DELETE FROM enquiry_admission_drafts WHERE enquiry_id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE admission draft error:', err);
    res.status(500).json({ error: 'Failed to clear admission draft' });
  }
});

app.post('/enquiries/:id/admission/start', async (req, res) => {
  const id = req.params.id;
  const token = String(req.body?.admission_token || '').trim();
  if (!token || token.length > 200) return res.status(400).json({ error: 'A valid admission session token is required' });
  try {
    const result = await pool.query(
      `UPDATE enquiries
       SET status='Pending', admission_token=$2, admission_started_at=CURRENT_TIMESTAMP
       WHERE id=$1
         AND (
           status IS NULL
           OR status IN ('New', 'Pending', 'Admission In Progress')
           OR (
             status='Admitted'
             AND NOT EXISTS (
               SELECT 1
               FROM students s
               WHERE NULLIF(TRIM(enquiries.mobile_number), '') IS NOT NULL
                 AND UPPER(TRIM(s.name)) = UPPER(TRIM(enquiries.student_name))
                 AND REGEXP_REPLACE(COALESCE(s.phone, ''), '\\D', '', 'g') =
                     REGEXP_REPLACE(COALESCE(enquiries.mobile_number, ''), '\\D', '', 'g')
             )
             AND NOT EXISTS (
               SELECT 1
               FROM test_batch_students t
               WHERE NULLIF(TRIM(enquiries.mobile_number), '') IS NOT NULL
                 AND UPPER(TRIM(t.name)) = UPPER(TRIM(enquiries.student_name))
                 AND REGEXP_REPLACE(COALESCE(t.phone, ''), '\\D', '', 'g') =
                     REGEXP_REPLACE(COALESCE(enquiries.mobile_number, ''), '\\D', '', 'g')
             )
           )
         )
       RETURNING id,batch,status,admission_started_at`,
      [id, token]
    );
    if (!result.rows.length) {
      return res.status(409).json({ error: 'This enquiry is already admitted or another admin is currently processing it. Try again after the current admission is cancelled or expires.' });
    }
    res.json({ success: true, enquiry: result.rows[0] });
  } catch (err) {
    console.error('POST /enquiries/:id/admission/start error:', err);
    res.status(500).json({ error: 'Failed to start admission' });
  }
});

app.post('/enquiries/:id/admission/cancel', async (req, res) => {
  const id = req.params.id;
  const token = String(req.body?.admission_token || '').trim();
  try {
    const result = await pool.query(
      `UPDATE enquiries
       SET status='Pending', admission_token=NULL, admission_started_at=NULL
       WHERE id=$1 AND status IN ('Pending','Admission In Progress')
         AND admission_token=$2
       RETURNING id`,
      [id, token]
    );
    if (!result.rows.length) {
      return res.status(409).json({ error: 'Admission could not be cancelled because it is no longer yours to cancel or is being processed by another admin.' });
    }
    res.json({ success: true, status: 'Pending' });
  } catch (err) {
    console.error('POST /enquiries/:id/admission/cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel admission' });
  }
});

app.put('/enquiries/:id', async (req, res) => {
	const { id } = req.params;
	const { status, comment, reason } = req.body;

	const normalizedStatus = String(status || 'Pending').trim();
	if (!['Pending', 'Rejected'].includes(normalizedStatus)) {
		return res.status(400).json({ success: false, error: 'Use the admission workflow to change an enquiry to Admitted.' });
	}
	const rejectionReason = String(reason || comment || '').trim();
	if (normalizedStatus === 'Rejected' && !rejectionReason) {
		return res.status(400).json({ success: false, error: 'A rejection reason is required.' });
	}

	try {
		const result = await pool.query(
			`
		UPDATE enquiries
		SET status = $1,
			comment = $2,
			reason = $3,
			admission_token = NULL,
			admission_started_at = NULL
		WHERE id = $4 AND status <> 'Admitted'
		RETURNING *
		`,
			[ normalizedStatus, normalizedStatus === 'Rejected' ? rejectionReason : (comment || null), normalizedStatus === 'Rejected' ? rejectionReason : (reason || null), id ]
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
			batch,
			dateOfBirth,
			parentName,
			mobileNumber,
			secondaryContact,
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

		if (!['Test Batch', 'Regular Batch'].includes(String(batch || '').trim())) {
			return res.status(400).json({ message: 'Please select Test Batch or Regular Batch' });
		}

		const cleanDateOfBirth = String(dateOfBirth || '').trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDateOfBirth) || Number.isNaN(Date.parse(cleanDateOfBirth)) || cleanDateOfBirth > new Date().toISOString().slice(0, 10)) {
			return res.status(400).json({ message: 'Please provide a valid date of birth' });
		}

		const [birthYear, birthMonth, birthDay] = cleanDateOfBirth.split('-').map(Number);
		const today = new Date();
		let studentAge = today.getFullYear() - birthYear;
		if (today.getMonth() + 1 < birthMonth ||
			(today.getMonth() + 1 === birthMonth && today.getDate() < birthDay)) studentAge--;
		if (studentAge < 12 || studentAge > 19) {
			return res.status(400).json({ message: 'Student must be between 12 and 19 years old' });
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
			reference,
			batch,
			date_of_birth,
			status
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'New')
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
				null, // area is optional on the public enquiry form
				reference || null,
				String(batch).trim(),
				cleanDateOfBirth
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
		// Migrate legacy in-progress rows created before admission sessions used a
		// separate token lock. New admission sessions keep status='Pending'.
		await pool.query(`
			UPDATE enquiries
			SET status='Pending', admission_token=NULL, admission_started_at=NULL
			WHERE status='Admission In Progress'
		`);

		// Release abandoned token locks if the browser exit request could not reach the server.
		await pool.query(`
			UPDATE enquiries
			SET status='Pending',
				admission_token=NULL,
				admission_started_at=NULL
			WHERE (status='Admission In Progress' OR admission_token IS NOT NULL)
			  AND (
				admission_started_at IS NULL
				OR admission_started_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'
			  )
		`);

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
			batch,
			date_of_birth,
			parent_name,
			secondary_contact,
			created_at,
			status,
			comment,
			reason,
			area,
			reference,
			admission_started_at,
			(admission_token IS NOT NULL) AS admission_in_progress
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
    await ensureRecordAuditSchema();
    const dayOfWeek = new Date(date).getDay();

    // ==========================
    // SUNDAY MODE
    // ==========================
    if (dayOfWeek === 0) {
      const result = await pool.query(
        `
        SELECT
          tr.roll_no,
          tr.student_name AS name,
          tr.class,
          tr.board,
          tr.subject_id,
          tr.test_code,
          a.status AS attendance_status,
          a.updated_by AS attendance_marked_by,
          a.updated_by_name AS attendance_updated_by_name,
          a.edited_by_name AS attendance_edited_by_name,
          a.marked_at AS attendance_marked_at,
          a.edited_at AS attendance_edited_at
        FROM test_registrations tr
        LEFT JOIN attendance a
          ON UPPER(TRIM(a.roll_no)) = UPPER(TRIM(tr.roll_no))
          AND a.subject_id = tr.subject_id
          AND a.attendance_date = $1
        WHERE tr.writing_date = $1
        ORDER BY tr.class, tr.subject_id, tr.roll_no
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
          tr.roll_no,
          tr.student_name AS name,
          tr.class,
          tr.board,
          tr.subject_id,
          tr.test_code,
          a.status AS attendance_status,
          a.updated_by AS attendance_marked_by,
          a.updated_by_name AS attendance_updated_by_name,
          a.edited_by_name AS attendance_edited_by_name,
          a.marked_at AS attendance_marked_at,
          a.edited_at AS attendance_edited_at
        FROM test_registrations tr
        LEFT JOIN attendance a
          ON UPPER(TRIM(a.roll_no)) = UPPER(TRIM(tr.roll_no))
          AND a.subject_id = tr.subject_id
          AND a.attendance_date = $1
        WHERE tr.writing_date = $1
          AND TRIM(tr.class) = TRIM($2)
          AND UPPER(TRIM(tr.board)) = UPPER(TRIM($3))
          AND tr.subject_id = $4
        ORDER BY tr.roll_no
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
        s.date_of_birth,
        s.batch,
        s.academic_year_from,
        s.academic_year_to,
        s.parent_name,
        s.secondary_contact,
        s.reference,
        a.status AS attendance_status,
        a.updated_by AS attendance_marked_by,
        a.updated_by_name AS attendance_updated_by_name,
        a.edited_by_name AS attendance_edited_by_name,
        a.marked_at AS attendance_marked_at,
        a.edited_at AS attendance_edited_at
      FROM students s
      INNER JOIN student_subjects ss
        ON UPPER(TRIM(ss.roll_no)) = UPPER(TRIM(s.roll_no))
      LEFT JOIN attendance a
        ON UPPER(TRIM(a.roll_no)) = UPPER(TRIM(s.roll_no))
        AND a.subject_id = ss.subject_id
        AND a.attendance_date = $4
      WHERE TRIM(s.class) = TRIM($1)
        AND UPPER(TRIM(s.board)) = UPPER(TRIM($2))
        AND ss.subject_id = $3
      ORDER BY s.roll_no ASC
      `,
      [className, board, Number(subject_id), date]
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


let recordAuditSchemaPromise = null;

async function ensureRecordAuditSchema() {
  if (!recordAuditSchemaPromise) {
    recordAuditSchemaPromise = (async () => {
      await pool.query(`
        ALTER TABLE marks
          ADD COLUMN IF NOT EXISTS entered_by VARCHAR(30),
          ADD COLUMN IF NOT EXISTS entered_by_name VARCHAR(150),
          ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS updated_by VARCHAR(30),
          ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(150),
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
      `);
      await pool.query(`
        ALTER TABLE attendance
          ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(150),
          ADD COLUMN IF NOT EXISTS edited_by_name VARCHAR(150)
      `);
      await pool.query(`
        ALTER TABLE test_batch_marks
          ADD COLUMN IF NOT EXISTS entered_by VARCHAR(30),
          ADD COLUMN IF NOT EXISTS entered_by_name VARCHAR(150),
          ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS updated_by VARCHAR(30),
          ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(150)
      `);
      await pool.query(`
        ALTER TABLE test_batch_attendance
          ADD COLUMN IF NOT EXISTS marked_by_name VARCHAR(150),
          ADD COLUMN IF NOT EXISTS edited_by_name VARCHAR(150),
          ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(150)
      `);
      await pool.query(`
        UPDATE attendance a SET updated_by_name=f.name FROM faculty f WHERE a.updated_by_name IS NULL AND UPPER(TRIM(a.updated_by))=UPPER(TRIM(f.faculty_id))
      `);
      await pool.query(`
        UPDATE attendance a SET edited_by_name=f.name FROM faculty f WHERE a.edited_by_name IS NULL AND UPPER(TRIM(a.edited_by))=UPPER(TRIM(f.faculty_id))
      `);
      await pool.query(`
        UPDATE test_batch_attendance a SET marked_by_name=f.name FROM faculty f WHERE a.marked_by_name IS NULL AND UPPER(TRIM(a.marked_by))=UPPER(TRIM(f.faculty_id))
      `);
      await pool.query(`
        UPDATE test_batch_attendance a SET edited_by_name=f.name FROM faculty f WHERE a.edited_by_name IS NULL AND UPPER(TRIM(a.edited_by))=UPPER(TRIM(f.faculty_id))
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS record_audit_history (
          id BIGSERIAL PRIMARY KEY,
          record_type VARCHAR(40) NOT NULL,
          record_key JSONB NOT NULL,
          action VARCHAR(10) NOT NULL,
          old_value JSONB,
          new_value JSONB NOT NULL,
          actor_id VARCHAR(30),
          actor_name VARCHAR(150),
          changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_record_audit_history_key_time
        ON record_audit_history(record_type, record_key, changed_at DESC)
      `);
      await pool.query(`
        CREATE OR REPLACE FUNCTION audit_student_record_change()
        RETURNS TRIGGER AS $audit$
        DECLARE
          old_json JSONB;
          new_json JSONB;
          actor_id_value TEXT;
          actor_name_value TEXT;
          key_json JSONB;
        BEGIN
          old_json := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
          new_json := to_jsonb(NEW);
          actor_id_value := COALESCE(
            new_json->>'edited_by', new_json->>'updated_by',
            new_json->>'entered_by', new_json->>'marked_by',
            old_json->>'edited_by', old_json->>'updated_by',
            old_json->>'entered_by', old_json->>'marked_by'
          );
          actor_name_value := COALESCE(
            new_json->>'edited_by_name', new_json->>'updated_by_name',
            new_json->>'entered_by_name', new_json->>'marked_by_name',
            old_json->>'edited_by_name', old_json->>'updated_by_name',
            old_json->>'entered_by_name', old_json->>'marked_by_name'
          );
          IF actor_name_value IS NULL AND actor_id_value IS NOT NULL THEN
            SELECT name INTO actor_name_value
            FROM faculty
            WHERE UPPER(TRIM(faculty_id)) = UPPER(TRIM(actor_id_value))
            LIMIT 1;
          END IF;
          IF TG_TABLE_NAME = 'marks' THEN
            key_json := jsonb_build_object('roll_no',new_json->>'roll_no','test_code',new_json->>'test_code');
          ELSIF TG_TABLE_NAME = 'test_batch_marks' THEN
            key_json := jsonb_build_object('roll_no',new_json->>'roll_no','test_code',new_json->>'test_code','subject_name',new_json->>'subject_name');
          ELSIF TG_TABLE_NAME = 'attendance' THEN
            key_json := jsonb_build_object('roll_no',new_json->>'roll_no','subject_id',new_json->>'subject_id','attendance_date',new_json->>'attendance_date');
          ELSE
            key_json := jsonb_build_object('roll_no',new_json->>'roll_no','attendance_date',new_json->>'attendance_date');
          END IF;
          INSERT INTO record_audit_history
            (record_type,record_key,action,old_value,new_value,actor_id,actor_name,changed_at)
          VALUES
            (TG_TABLE_NAME,key_json,TG_OP,old_json,new_json,actor_id_value,actor_name_value,CURRENT_TIMESTAMP);
          RETURN NEW;
        END;
        $audit$ LANGUAGE plpgsql
      `);
      for (const tableName of ['marks','attendance','test_batch_marks','test_batch_attendance']) {
        const triggerName = 'trg_audit_' + tableName;
        await pool.query('DROP TRIGGER IF EXISTS ' + triggerName + ' ON ' + tableName);
        await pool.query(
          'CREATE TRIGGER ' + triggerName +
          ' AFTER INSERT OR UPDATE ON ' + tableName +
          ' FOR EACH ROW EXECUTE FUNCTION audit_student_record_change()'
        );
      }
    })().catch((error) => {
      recordAuditSchemaPromise = null;
      throw error;
    });
  }
  return recordAuditSchemaPromise;
}

async function requireRecordAuditActor(req, res, next) {
  try {
    await ensureRecordAuditSchema();
    const candidate = String(
      req.get('x-admin-id') ||
      (req.body && req.body.adminId) ||
      req.query.adminId ||
      req.get('x-faculty-id') ||
      (req.body && req.body.facultyId) || req.query.facultyId || ''
    ).trim().toUpperCase();
    if (!/^IG\d{3,}$/.test(candidate)) {
      return res.status(403).json({ error: 'Authorized faculty or admin access required' });
    }
    const result = await pool.query(
      'SELECT faculty_id, name FROM faculty WHERE UPPER(TRIM(faculty_id))=$1 LIMIT 1',
      [candidate]
    );
    if (!result.rows.length) {
      return res.status(403).json({ error: 'Faculty/admin account not found or not authorized' });
    }
    req.recordAuditActor = {
      id: String(result.rows[0].faculty_id).trim().toUpperCase(),
      name: String(result.rows[0].name || '').trim()
    };
    return next();
  } catch (error) {
    console.error('Record audit authorization/schema error:', error);
    return res.status(500).json({ error: 'Unable to verify record entry permissions' });
  }
}

const TEST_BATCH_ADMIN_IDS = new Set(['IG001', 'IG002']);

// Verify an existing IG faculty account for Test Batch operational access.
// This middleware is used by dashboard reads, student management, attendance,
// and marks workflows. Test Batch series/configuration administration remains
// protected by requireTestBatchAdmin where applicable.
async function requireTestBatchAttendanceMarksAccess(req, res, next) {
  try {
    await ensureRecordAuditSchema();
    const candidate = String(
      req.get('x-admin-id') ||
      (req.body && req.body.adminId) ||
      req.query.adminId ||
      req.get('x-faculty-id') ||
      (req.body && req.body.facultyId) ||
      req.query.facultyId ||
      ''
    ).toUpperCase().trim();

    const match = candidate.match(/^IG(\d{3,})$/);
    const sequence = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(sequence) || sequence < 1) {
      return res.status(403).json({ error: 'Authorized faculty access required' });
    }

    const result = await pool.query(
      'SELECT faculty_id, name FROM faculty WHERE UPPER(TRIM(faculty_id)) = $1 LIMIT 1',
      [candidate]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Faculty account not found or not authorized' });
    }

    req.recordAuditActor = { id: String(result.rows[0].faculty_id).trim().toUpperCase(), name: String(result.rows[0].name || '').trim() };
    // Any existing IG faculty may record attendance/marks. Test Batch
    // administration/configuration routes remain protected by requireTestBatchAdmin.
    req.testBatchFacultyId = candidate;
    req.testBatchAdminId = candidate;
    next();
  } catch (err) {
    console.error('Test Batch faculty attendance/marks authorization error:', err);
    res.status(500).json({ error: 'Failed to verify faculty access' });
  }
}

async function requireTestBatchAdmin(req, res, next) {
  try {
    await ensureRecordAuditSchema();
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
      'SELECT faculty_id, name FROM faculty WHERE UPPER(TRIM(faculty_id)) = $1 LIMIT 1',
      [candidate]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized administrator' });
    }

    req.testBatchAdminId = candidate;
    req.recordAuditActor = { id: String(result.rows[0].faculty_id).trim().toUpperCase(), name: String(result.rows[0].name || '').trim() };
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

function isTestBatchSubjectEligible(studentSubjects, testSubject) {
  const subjects = String(studentSubjects || '').trim().toLowerCase();
  const subject = String(testSubject || '').trim().toLowerCase();

  if (!['mathematics', 'physics'].includes(subject)) return false;
  return subjects === 'both' || subjects === subject;
}

function validateTestBatchMarks(totalMarks, obtained) {
  const total = Number(totalMarks);
  const raw = String(obtained ?? '').trim().toUpperCase();
  if (!Number.isFinite(total) || total <= 0) return { ok:false, error:'Total marks must be greater than zero' };
  if (!raw) return { ok:false, error:'Obtained marks are required' };
  if (raw === 'A') return { ok:true, obtained:'A' };
  const numeric = Number(raw);
  if (!/^([0-9]+)(\.[0-9]+)?$/.test(raw)) {
    return { ok:false, error:'Obtained marks must be a valid number, or A' };
  }
  if (/^0+[0-9]/.test(raw)) {
    return { ok:false, error:'Obtained marks cannot contain unnecessary leading zeros' };
  }
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > total) {
    return { ok:false, error:'Obtained marks must be between 0 and total marks, or A' };
  }
  return { ok:true, obtained:String(numeric) };
}

function marksComputedFields(row) {
  const total = Number(row.total_marks || 0);
  const raw = String(row.marks_obtained || '').trim().toUpperCase();
  if (raw === 'A') return { ...row, percentage:null, result_status:'Absent' };
  const percentage = total > 0 ? (Number(raw) / total) * 100 : 0;
  return { ...row, percentage:Number(percentage.toFixed(2)), result_status:percentage >= 40 ? 'Pass' : 'Fail' };
}

app.get('/test-batch/tests', requireTestBatchAttendanceMarksAccess, async (req,res) => {
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

app.post('/test-batch/tests', requireTestBatchAttendanceMarksAccess, async (req,res) => {
  try {
    const {
      test_code,test_series_id,subject_name,test_date,writing_date,slot_start,slot_end,
      duration_minutes,total_marks,portion,chapter,application_open_date,application_close_date,writing_close_date,status
    }=req.body||{};
    if(!test_code||!test_series_id||!subject_name||!duration_minutes||!total_marks){
      return res.status(400).json({error:'Test code, test batch, subject, duration and total marks are required'});
    }
    const series=await validateTestBatchSeries(test_series_id);
    if(!series)return res.status(400).json({error:'Invalid Test Series'});

    if (application_open_date && application_close_date && application_close_date < application_open_date) {
      return res.status(400).json({error:'Application close date cannot be before application open date'});
    }
    if (application_close_date && writing_close_date && application_close_date >= writing_close_date) {
      return res.status(400).json({error:'Registration close date must be before the writing close date'});
    }
    const result=await pool.query(
      'INSERT INTO test_batch_tests(test_code,test_series_id,subject_name,test_date,writing_date,slot_start,slot_end,duration_minutes,total_marks,portion,chapter,application_open_date,application_close_date,writing_close_date,status,created_by) '+
      'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (test_code) DO NOTHING RETURNING *',
      [String(test_code).trim().toUpperCase(),Number(test_series_id),String(subject_name).trim(),test_date,writing_date,slot_start||null,slot_end||null,Number(duration_minutes),Number(total_marks),portion||null,chapter||null,application_open_date||null,application_close_date||null,writing_close_date||null,status||'Scheduled',req.testBatchAdminId]);
    if (!result.rows.length) return res.status(409).json({error:'Test code already exists. Use a unique test code.'});
    res.status(201).json({message:'Test Batch test created successfully',test:result.rows[0]});
  } catch(err){
    console.error('POST /test-batch/tests error:',err);
    if(err.code==='23505')return res.status(400).json({error:'Test code already exists'});
    res.status(500).json({error:'Failed to create Test Batch test',details:err.message});
  }
});

app.put('/test-batch/tests/:id', requireTestBatchAttendanceMarksAccess, async (req,res) => {
  try {
    if (!TEST_BATCH_ADMIN_IDS.has(String(req.testBatchAdminId || '').toUpperCase().trim())) {
      return res.status(403).json({error:'Faculty must receive admin approval before editing a Test Batch schedule'});
    }
    const {
      test_code,test_series_id,subject_name,test_date,writing_date,slot_start,slot_end,
      duration_minutes,total_marks,portion,chapter,application_open_date,application_close_date,writing_close_date,status
    }=req.body||{};
    if (application_open_date && application_close_date && application_close_date < application_open_date) {
      return res.status(400).json({error:'Application close date cannot be before application open date'});
    }
    if (application_close_date && writing_close_date && application_close_date >= writing_close_date) {
      return res.status(400).json({error:'Registration close date must be before the writing close date'});
    }
    const result=await pool.query(
      'UPDATE test_batch_tests SET test_code=$1,test_series_id=$2,subject_name=$3,test_date=$4,writing_date=$5,slot_start=$6,slot_end=$7,duration_minutes=$8,total_marks=$9,portion=$10,chapter=$11,application_open_date=$12,application_close_date=$13,writing_close_date=$14,status=$15,updated_at=CURRENT_TIMESTAMP WHERE id=$16 RETURNING *',
      [String(test_code).trim().toUpperCase(),Number(test_series_id),String(subject_name).trim(),test_date,writing_date,slot_start||null,slot_end||null,Number(duration_minutes),Number(total_marks),portion||null,chapter||null,application_open_date||null,application_close_date||null,writing_close_date||null,status||'Scheduled',Number(req.params.id)]);
    if(!result.rows.length)return res.status(404).json({error:'Test Batch test not found'});
    res.json({message:'Test Batch test updated successfully',test:result.rows[0]});
  } catch(err){
    console.error('PUT /test-batch/tests/:id error:',err);
    if(err.code==='23505')return res.status(400).json({error:'Test code already exists'});
    res.status(500).json({error:'Failed to update Test Batch test',details:err.message});
  }
});


/* =========================================================
   TEST BATCH STUDENT REGISTRATION
   Students can register only inside the configured application window.
========================================================= */

app.get('/test-batch/student-tests/:rollNo', async (req,res) => {
  try {
    const rollNo = String(req.params.rollNo || '').trim().toUpperCase();
    const student = await pool.query(
      'SELECT roll_no,test_series_id,board,class,subjects FROM test_batch_students WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1)) LIMIT 1',
      [rollNo]
    );
    if (!student.rows.length) return res.status(404).json({error:'Test Batch student not found'});

    const studentRow = student.rows[0];

    const result = await pool.query(
      `SELECT
         t.id,t.test_code,t.test_series_id,s.name AS test_series_name,t.subject_name,
         t.test_date,t.writing_date,t.slot_start,t.slot_end,t.duration_minutes,
         t.total_marks,t.portion,t.chapter,t.application_open_date,t.application_close_date,t.writing_close_date,
         t.status,
         CASE
           WHEN r.id IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM test_batch_attendance a
               WHERE UPPER(TRIM(a.roll_no))=UPPER(TRIM($1))
                 AND a.attendance_date = COALESCE(r.writing_date,t.writing_date)
                 AND LOWER(TRIM(a.status)) = 'absent'
             )
             THEN true
           ELSE false
         END AS is_absent,
         CASE
           WHEN (r.id IS NOT NULL AND EXISTS (
             SELECT 1 FROM test_batch_attendance a
             WHERE UPPER(TRIM(a.roll_no))=UPPER(TRIM($1))
               AND a.attendance_date=COALESCE(r.writing_date,t.writing_date)
               AND LOWER(TRIM(a.status))='absent'
           )) OR (r.id IS NULL AND t.application_close_date IS NOT NULL AND t.application_close_date < CURRENT_DATE)
           THEN true ELSE false
         END AS is_lapsed,
         CASE
           WHEN t.status IN ('Completed','Returned') THEN true
           WHEN r.id IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM test_batch_attendance a
               WHERE UPPER(TRIM(a.roll_no))=UPPER(TRIM($1))
                 AND a.attendance_date = COALESCE(r.writing_date,t.writing_date)
                 AND LOWER(TRIM(a.status)) = 'present'
             )
             THEN true
           ELSE false
         END AS is_completed,
         CASE WHEN r.id IS NOT NULL AND r.status='Registered' THEN true ELSE false END AS is_registered,
         r.registered_at,r.writing_date AS registered_writing_date,
         r.slot_start AS registered_slot_start,r.slot_end AS registered_slot_end
       FROM test_batch_tests t
       JOIN test_series s ON s.id=t.test_series_id
       LEFT JOIN test_batch_registrations r
         ON r.test_code=t.test_code AND UPPER(TRIM(r.roll_no))=UPPER(TRIM($1))
       WHERE t.test_series_id=$2
         AND t.status IN ('Scheduled','Active','Completed','Returned')
       ORDER BY
         CASE WHEN t.status IN ('Scheduled','Active') THEN 0 ELSE 1 END,
         t.application_open_date ASC,
         t.test_code ASC`,
      [rollNo, studentRow.test_series_id]
    );

    const studentBoard = normalizeTestBatchBoard(studentRow.board);
    const studentClass = String(studentRow.class || '').trim();

    const filteredTests = result.rows.filter((test) => {
      const parsed = parseTestBatchCode(test.test_code);
      if (!parsed) return false;

      const testBoard = normalizeTestBatchBoard(parsed.board);
      const matchesBoardAndClass =
        testBoard === studentBoard &&
        String(parsed.className) === studentClass;

      if (!matchesBoardAndClass) return false;

      // Subject eligibility is an additional layer on top of the existing
      // Test Series + board + class + status rules.
      return isTestBatchSubjectEligible(studentRow.subjects, parsed.subject);
    });

    res.json({tests:filteredTests});
  } catch(err) {
    console.error('GET /test-batch/student-tests/:rollNo error:',err);
    res.status(500).json({error:'Failed to fetch Test Batch test schedule'});
  }
});

app.post('/test-batch/tests/:testCode/register', async (req,res) => {
  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    const testCode = String(req.params.testCode || '').trim().toUpperCase();
    const rollNo = String(req.body?.roll_no || '').trim().toUpperCase();
    if (!rollNo) return res.status(400).json({error:'Roll number is required'});

    const student = await pool.query(
      'SELECT roll_no,test_series_id,board,class,subjects FROM test_batch_students WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1)) LIMIT 1',
      [rollNo]
    );
    if (!student.rows.length) return res.status(404).json({error:'Test Batch student not found'});

    const testResult = await pool.query(
      `SELECT test_code,test_series_id,subject_name,test_date,writing_date,slot_start,slot_end,
              duration_minutes,application_open_date,application_close_date,writing_close_date,status
       FROM test_batch_tests
       WHERE UPPER(TRIM(test_code))=UPPER(TRIM($1))
       LIMIT 1`,
      [testCode]
    );
    if (!testResult.rows.length) return res.status(404).json({error:'Test Batch test not found'});

    const test = testResult.rows[0];
    if (Number(test.test_series_id) !== Number(student.rows[0].test_series_id)) {
      return res.status(403).json({error:'This test is not assigned to the student\'s Test Batch'});
    }

    const parsedTest = parseTestBatchCode(testCode);
    if (!parsedTest) {
      return res.status(400).json({error:'Invalid Test Batch test code format'});
    }

    const studentBoard = normalizeTestBatchBoard(student.rows[0].board);
    const requiredBoard = normalizeTestBatchBoard(parsedTest.board);
    const studentClass = String(student.rows[0].class || '').trim();
    if (studentBoard !== requiredBoard || studentClass !== parsedTest.className) {
      return res.status(403).json({
        error:'This test is not assigned to the student\'s board and class'
      });
    }

    if (!isTestBatchSubjectEligible(student.rows[0].subjects, parsedTest.subject)) {
      return res.status(403).json({
        error:'This student is not registered for the test subject'
      });
    }

    const selectedWritingDate = String(req.body?.writing_date || '').trim();
    const selectedSlotStart = req.body?.slot_start ? String(req.body.slot_start).trim() : null;
    const selectedSlotEnd = req.body?.slot_end ? String(req.body.slot_end).trim() : null;

    if (!selectedWritingDate) {
      return res.status(400).json({error:'Select a test date'});
    }
    if (!selectedSlotStart || !selectedSlotEnd) {
      return res.status(400).json({error:'Select a test slot'});
    }
    if (!['Scheduled','Active'].includes(test.status)) {
      return res.status(400).json({error:'Registration is not available for this test'});
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const open = new Date(test.application_open_date);
    const close = new Date(test.application_close_date);
    const writingClose = new Date(test.writing_close_date);
    const chosenDate = new Date(selectedWritingDate);
    open.setHours(0,0,0,0);
    close.setHours(0,0,0,0);
    writingClose.setHours(0,0,0,0);
    chosenDate.setHours(0,0,0,0);

    if (today < open || today > close) {
      return res.status(400).json({error:'Registration period is closed for this test'});
    }
    if (Number.isNaN(chosenDate.getTime()) || Number.isNaN(writingClose.getTime()) || chosenDate < open || chosenDate > writingClose) {
      return res.status(400).json({error:'Selected writing date must be between the opening date and Writing Close Date'});
    }

    const durationMinutes = Number(test.duration_minutes);
    const slotStartMinutes = timeStringToMinutes(selectedSlotStart);
    const slotEndMinutes = timeStringToMinutes(selectedSlotEnd);

    if (
      !Number.isFinite(slotStartMinutes) ||
      !Number.isFinite(slotEndMinutes) ||
      slotEndMinutes <= slotStartMinutes ||
      slotEndMinutes - slotStartMinutes !== durationMinutes
    ) {
      return res.status(400).json({error:'Selected slot does not match the test duration'});
    }

    // Test date must be at least 3 calendar days after the registration date.
    const registrationToday = new Date();
    registrationToday.setHours(0,0,0,0);
    const minimumWritingDate = new Date(registrationToday);
    minimumWritingDate.setDate(minimumWritingDate.getDate() + 3);

    if (chosenDate < minimumWritingDate) {
      return res.status(400).json({
        error:'Test date must be at least 3 days after registration'
      });
    }

    const fixedSlots = getTestBatchSlots(durationMinutes, selectedWritingDate);
    if (
      fixedSlots.length === 0 ||
      !fixedSlots.some(
        slot => slot.start === selectedSlotStart && slot.end === selectedSlotEnd
      )
    ) {
      return res.status(400).json({
        error:'Invalid Test Batch slot for the selected date and test duration'
      });
    }

    // Serialize registrations for this student and writing date across all
    // API instances. The slot-conflict check and upsert run in the same
    // transaction, so concurrent Physics/Mathematics requests cannot both win.
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [rollNo + '|' + selectedWritingDate]
    );

    const conflictingRegistration = await client.query(
      `SELECT id
       FROM test_batch_registrations
       WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
         AND writing_date = $2::date
         AND status = 'Registered'
         AND slot_start IS NOT NULL
         AND slot_end IS NOT NULL
         AND slot_start < $4::time
         AND slot_end > $3::time
         AND UPPER(TRIM(test_code)) <> UPPER(TRIM($5))
       LIMIT 1`,
      [rollNo, selectedWritingDate, selectedSlotStart, selectedSlotEnd, testCode]
    );

    if (conflictingRegistration.rows.length > 0) {
      return res.status(409).json({
        error: 'You have already registered for a test in this slot.'
      });
    }

    const registered = await client.query(
      `INSERT INTO test_batch_registrations
       (test_code,roll_no,writing_date,slot_start,slot_end,status,updated_at)
       VALUES($1,$2,$3,$4,$5,'Registered',CURRENT_TIMESTAMP)
       ON CONFLICT(test_code,roll_no)
       DO UPDATE SET
         writing_date=EXCLUDED.writing_date,
         slot_start=EXCLUDED.slot_start,
         slot_end=EXCLUDED.slot_end,
         status='Registered',
         updated_at=CURRENT_TIMESTAMP
       RETURNING *, (xmax = 0) AS is_new_registration`,
      [testCode,rollNo,selectedWritingDate,selectedSlotStart,selectedSlotEnd]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    const registration = registered.rows[0];

    // Notify both Test Batch admins immediately for a newly created registration.
    // Notification failures must never make a successful student registration fail.
    if (registration?.is_new_registration === true) {
      const registeredAt = formatTestBatchRegistrationDateTime(registration.registered_at);
      const studentNameResult = await pool.query(
        'SELECT name FROM test_batch_students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1)) LIMIT 1',
        [rollNo]
      );
      const studentName = String(studentNameResult.rows[0]?.name || '').trim() || rollNo;
      const notificationMessage =
        `Test Reminder - ${testCode} is scheduled by ${studentName}. Registered on ${registeredAt}.`;

      try {
        await Promise.all(
          ['IG001','IG002'].map((adminId) =>
            createFacultyNotification(pool, {
              facultyId: adminId,
              moduleName: 'test-batch',
              title: 'Test Batch Registration',
              message: notificationMessage,
              data: {
                module_name: 'test-batch-admin-registration',
                test_code: testCode,
                roll_no: rollNo,
                registered_at: String(registration.registered_at || ''),
                notification_type: 'test_batch_registration'
              }
            })
          )
        );
      } catch (notificationError) {
        console.error(
          'Test Batch registration notification failed:',
          notificationError
        );
      }
    }

    res.status(201).json({message:'Test Batch test registration successful',registration:registered.rows[0]});
  } catch(err) {
    console.error('POST /test-batch/tests/:testCode/register error:',err);
    res.status(500).json({error:'Failed to register for Test Batch test',details:err.message});
  } finally {
    if (client) {
      if (transactionStarted) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {
          console.error('Test Batch registration rollback failed:', rollbackError);
        }
      }
      client.release();
    }
  }
});

app.delete('/test-batch/tests/:id', requireTestBatchAttendanceMarksAccess, async (req,res) => {
  try {
    const result=await pool.query('DELETE FROM test_batch_tests WHERE id=$1 RETURNING id,test_code',[Number(req.params.id)]);
    if(!result.rows.length)return res.status(404).json({error:'Test Batch test not found'});
    res.json({message:'Test Batch test deleted successfully',test:result.rows[0]});
  } catch(err){ console.error('DELETE /test-batch/tests/:id error:',err); res.status(500).json({error:'Failed to delete Test Batch test'}); }
});

/* =========================================================
   TEST BATCH POST-TEST CONFIGURATION
   Available only after a test is Completed or Returned.
========================================================= */

app.get('/test-batch/tests/:testCode/post-test', requireTestBatchAttendanceMarksAccess, async (req,res) => {
  try {
    const result = await pool.query(
      `SELECT
         t.id,t.test_code,t.test_series_id,s.name AS test_series_name,
         t.subject_name,t.test_date,t.writing_date,t.slot_start,t.slot_end,
         t.duration_minutes,t.total_marks,t.portion,t.chapter,
         t.application_open_date,t.application_close_date,t.status,
         t.manual_mark_entry_enabled,t.bulk_mark_upload_enabled,
         t.passing_percentage,t.grade_boundaries,
         t.result_publication_mode,t.show_detailed_breakdown,
         t.reevaluation_enabled,t.lock_marks_after_final_submission,
         t.post_test_export_enabled,t.result_publication_status,
         t.result_published_at,t.marks_entry_status
       FROM test_batch_tests t
       JOIN test_series s ON s.id=t.test_series_id
       WHERE UPPER(TRIM(t.test_code))=UPPER(TRIM($1))
       LIMIT 1`,
      [req.params.testCode]
    );

    if (!result.rows.length) return res.status(404).json({error:'Test Batch test not found'});
    const test = result.rows[0];

    if (!['Completed','Returned'].includes(test.status)) {
      return res.status(400).json({error:'Post Test is available only for completed or returned tests'});
    }

    res.json({test});
  } catch(err) {
    console.error('GET /test-batch/tests/:testCode/post-test error:',err);
    res.status(500).json({error:'Failed to load Test Batch post-test settings'});
  }
});

app.put('/test-batch/tests/:testCode/post-test', requireTestBatchAttendanceMarksAccess, async (req,res) => {
  try {
    const body = req.body || {};
    const result = await pool.query(
      `SELECT id,status,marks_entry_status
       FROM test_batch_tests
       WHERE UPPER(TRIM(test_code))=UPPER(TRIM($1))
       LIMIT 1`,
      [req.params.testCode]
    );

    if (!result.rows.length) return res.status(404).json({error:'Test Batch test not found'});
    const test = result.rows[0];

    if (!['Completed','Returned'].includes(test.status)) {
      return res.status(400).json({error:'Post Test settings can only be changed for completed or returned tests'});
    }

    const passing = Number(body.passing_percentage);
    if (!Number.isFinite(passing) || passing < 0 || passing > 100) {
      return res.status(400).json({error:'Passing percentage must be between 0 and 100'});
    }

    const boundaries = body.grade_boundaries || {A:90,B:75,C:60,D:40};
    if (!boundaries || typeof boundaries !== 'object' || Array.isArray(boundaries)) {
      return res.status(400).json({error:'Grade boundaries must be an object'});
    }

    for (const grade of ['A','B','C','D']) {
      const value = Number(boundaries[grade]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return res.status(400).json({error:'Each grade boundary must be between 0 and 100'});
      }
    }

    const publicationMode = body.result_publication_mode === 'immediate' ? 'immediate' : 'approval';

    const updated = await pool.query(
      `UPDATE test_batch_tests
       SET manual_mark_entry_enabled=$1,
           bulk_mark_upload_enabled=$2,
           passing_percentage=$3,
           grade_boundaries=$4::jsonb,
           result_publication_mode=$5,
           show_detailed_breakdown=$6,
           reevaluation_enabled=$7,
           lock_marks_after_final_submission=$8,
           post_test_export_enabled=$9,
           result_publication_status=CASE WHEN $5='immediate' THEN 'Published' ELSE result_publication_status END,
           result_published_at=CASE WHEN $5='immediate' THEN COALESCE(result_published_at,CURRENT_TIMESTAMP) ELSE result_published_at END,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$10
       RETURNING *`,
      [
        body.manual_mark_entry_enabled !== false,
        body.bulk_mark_upload_enabled === true,
        passing,
        JSON.stringify({A:Number(boundaries.A),B:Number(boundaries.B),C:Number(boundaries.C),D:Number(boundaries.D)}),
        publicationMode,
        body.show_detailed_breakdown === true,
        body.reevaluation_enabled === true,
        body.lock_marks_after_final_submission !== false,
        body.post_test_export_enabled !== false,
        test.id
      ]
    );

    res.json({message:'Test Batch Post Test settings saved successfully',test:updated.rows[0]});
  } catch(err) {
    console.error('PUT /test-batch/tests/:testCode/post-test error:',err);
    res.status(500).json({error:'Failed to save Test Batch post-test settings',details:err.message});
  }
});

app.post('/test-batch/tests/:testCode/post-test/publish', requireTestBatchAttendanceMarksAccess, async (req,res) => {
  try {
    const result = await pool.query(
      `UPDATE test_batch_tests
       SET result_publication_status='Published',
           result_published_at=CURRENT_TIMESTAMP,
           updated_at=CURRENT_TIMESTAMP
       WHERE UPPER(TRIM(test_code))=UPPER(TRIM($1))
         AND status IN ('Completed','Returned')
         AND result_publication_mode='approval'
       RETURNING id,test_code,result_publication_status,result_published_at`,
      [req.params.testCode]
    );

    if (!result.rows.length) {
      return res.status(400).json({error:'Test must be completed/returned and configured for admin approval before publishing'});
    }

    res.json({message:'Test Batch results published successfully',test:result.rows[0]});
  } catch(err) {
    console.error('POST /test-batch/tests/:testCode/post-test/publish error:',err);
    res.status(500).json({error:'Failed to publish Test Batch results'});
  }
});

app.get('/test-batch/tests/:testCode/results', requireTestBatchAttendanceMarksAccess, async (req,res) => {
  try {
    const testResult = await pool.query(
      `SELECT passing_percentage,grade_boundaries,result_publication_status,
              show_detailed_breakdown,post_test_export_enabled
       FROM test_batch_tests
       WHERE UPPER(TRIM(test_code))=UPPER(TRIM($1))
       LIMIT 1`,
      [req.params.testCode]
    );
    if (!testResult.rows.length) return res.status(404).json({error:'Test Batch test not found'});

    const config = testResult.rows[0];
    const result=await pool.query(
      'SELECT m.id,m.roll_no,s.name,m.subject_name,m.total_marks,m.marks_obtained,m.comments '+
      'FROM test_batch_marks m JOIN test_batch_students s ON s.roll_no=m.roll_no '+
      'WHERE UPPER(TRIM(m.test_code))=UPPER(TRIM($1)) ORDER BY m.roll_no ASC',
      [req.params.testCode]);

    const passing = Number(config.passing_percentage ?? 40);
    const boundaries = config.grade_boundaries || {A:90,B:75,C:60,D:40};
    const results = result.rows.map(row => {
      const base = marksComputedFields(row);
      if (base.result_status === 'Absent') return {...base, grade:null};
      const percentage = Number(base.percentage || 0);
      let grade = 'F';
      for (const [label, minimum] of Object.entries(boundaries).sort((a,b)=>Number(b[1])-Number(a[1]))) {
        if (percentage >= Number(minimum)) { grade = label; break; }
      }
      return {
        ...base,
        result_status: percentage >= passing ? 'Pass' : 'Fail',
        grade,
      };
    });

    res.json({
      results,
      settings: {
        passing_percentage: passing,
        grade_boundaries: boundaries,
        result_publication_status: config.result_publication_status,
        show_detailed_breakdown: config.show_detailed_breakdown,
        post_test_export_enabled: config.post_test_export_enabled,
      }
    });
  } catch(err){ console.error('GET /test-batch/tests/:testCode/results error:',err); res.status(500).json({error:'Failed to fetch Test Batch results'}); }
});


/* =========================================================
   TEST BATCH MARK ENTRY
   Only completed/returned tests are eligible.
   Marks are stored only in test_batch_marks.
========================================================= */

app.get('/test-batch/student-status', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  try {
    const seriesId = String(req.query.seriesId || '').trim();
    const classFilter = String(req.query.class || '').trim();
    const boardFilter = String(req.query.board || '').trim();
    const categoryFilter = String(req.query.category || '').trim().toLowerCase();
    const testValues = [];
    let testWhere = "WHERE t.status <> 'Cancelled'";
    const studentValues = [];
    let studentWhere = 'WHERE 1=1';
    const registrationValues = [];
    let registrationWhere = "WHERE r.status = 'Registered'";

    if (seriesId) {
      const parsed = Number(seriesId);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'Invalid Test Series filter' });
      }
      testValues.push(parsed);
      testWhere += ' AND t.test_series_id=$' + testValues.length;
      studentValues.push(parsed);
      studentWhere += ' AND s.test_series_id=$' + studentValues.length;
      registrationValues.push(parsed);
      registrationWhere += ' AND t.test_series_id=$' + registrationValues.length;
    }
    if (categoryFilter === 'registered') {
      registrationWhere += " AND (r.writing_date IS NULL OR ((r.writing_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Kolkata') > NOW())";
    }
    if (classFilter) {
      studentValues.push(classFilter);
      studentWhere += ' AND TRIM(s.class)=TRIM($' + studentValues.length + ')';
      registrationValues.push(classFilter);
      registrationWhere += ' AND TRIM(s.class)=TRIM($' + registrationValues.length + ')';
    }
    if (boardFilter) {
      studentValues.push(boardFilter);
      studentWhere += " AND LOWER(REGEXP_REPLACE(TRIM(s.board), '[^a-zA-Z]', '', 'g'))=LOWER(REGEXP_REPLACE(TRIM($" + studentValues.length + "), '[^a-zA-Z]', '', 'g'))";
      registrationValues.push(boardFilter);
      registrationWhere += " AND LOWER(REGEXP_REPLACE(TRIM(s.board), '[^a-zA-Z]', '', 'g'))=LOWER(REGEXP_REPLACE(TRIM($" + registrationValues.length + "), '[^a-zA-Z]', '', 'g'))";
    }

    const [seriesResult, testsResult, studentsResult, registrationsResult] = await Promise.all([
      pool.query('SELECT id,name FROM test_series ORDER BY id'),
      pool.query(
        'SELECT t.*,ts.name AS test_series_name FROM test_batch_tests t JOIN test_series ts ON ts.id=t.test_series_id ' +
        testWhere + ' ORDER BY t.writing_date DESC,t.test_code ASC',
        testValues
      ),
      pool.query(
        'SELECT s.roll_no,s.name,s.class,s.board,s.subjects,s.academic_year_from,s.academic_year_to,s.test_series_id,ts.name AS test_series_name ' +
        'FROM test_batch_students s JOIN test_series ts ON ts.id=s.test_series_id ' +
        studentWhere + ' ORDER BY s.roll_no ASC',
        studentValues
      ),
      pool.query(
        `SELECT
           t.test_code, t.test_series_id, t.subject_name, ts.name AS test_series_name,
           s.roll_no, s.name, s.class, s.board, s.subjects,
           s.academic_year_from, s.academic_year_to,
           s.test_series_id AS student_test_series_id,
           r.writing_date AS registered_writing_date,
           r.slot_start AS registered_slot_start,
           r.slot_end AS registered_slot_end,
           r.registered_at,
           a.status AS attendance_status
         FROM test_batch_registrations r
         JOIN test_batch_tests t ON UPPER(TRIM(t.test_code))=UPPER(TRIM(r.test_code))
         JOIN test_series ts ON ts.id=t.test_series_id
         JOIN test_batch_students s ON UPPER(TRIM(s.roll_no))=UPPER(TRIM(r.roll_no))
         LEFT JOIN test_batch_attendance a
           ON UPPER(TRIM(a.roll_no))=UPPER(TRIM(r.roll_no))
          AND a.attendance_date=r.writing_date
         ${registrationWhere}
         ORDER BY t.test_code ASC,r.writing_date ASC,s.roll_no ASC`,
        registrationValues
      )
    ]);

    res.json({
      series: seriesResult.rows,
      tests: testsResult.rows,
      students: studentsResult.rows,
      registrations: registrationsResult.rows
    });
  } catch (err) {
    console.error('GET /test-batch/student-status error:', err);
    res.status(500).json({ error: 'Failed to fetch Test Batch student statuses' });
  }
});

app.get('/test-batch/tests/:testCode/registered-students', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  try {
    const code = String(req.params.testCode || '').trim().toUpperCase();

    const testResult = await pool.query(
      `SELECT
         t.id,
         t.test_code,
         t.test_series_id,
         s.name AS test_series_name,
         t.subject_name,
         t.duration_minutes,
         t.total_marks,
         t.status,
         t.application_open_date,
         t.application_close_date
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

    const category = String(req.query.category || '').trim();
    const classFilter = String(req.query.class || '').trim();
    const boardFilter = String(req.query.board || '').trim();
    const seriesFilter = String(req.query.seriesId || '').trim();
    const registeredVisibilityFilter = category === 'Registered'
      ? `AND (
           r.writing_date IS NULL
           OR ((r.writing_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Kolkata') > NOW()
         )`
      : '';

    const values = [code, test.test_series_id, test.subject_name];
    let studentFilters = '';
    if (classFilter) {
      values.push(classFilter);
      studentFilters += ` AND TRIM(s.class) = TRIM($${values.length})`;
    }
    if (boardFilter) {
      values.push(boardFilter);
      studentFilters += ` AND LOWER(REGEXP_REPLACE(TRIM(s.board), '[^a-zA-Z]', '', 'g')) = LOWER(REGEXP_REPLACE(TRIM($${values.length}), '[^a-zA-Z]', '', 'g'))`;
    }
    if (seriesFilter) {
      const parsedSeriesId = Number(seriesFilter);
      if (!Number.isSafeInteger(parsedSeriesId) || parsedSeriesId <= 0) {
        return res.status(400).json({ error: 'Invalid Test Series filter' });
      }
      values.push(parsedSeriesId);
      studentFilters += ` AND s.test_series_id = $${values.length}`;
    }

    const studentsResult = await pool.query(
      `SELECT
         s.roll_no,
         s.name,
         s.class,
         s.board,
         s.academic_year_from,
         s.academic_year_to,
         s.test_series_id,
         r.writing_date AS registered_writing_date,
         r.slot_start AS registered_slot_start,
         r.slot_end AS registered_slot_end,
         r.registered_at,
         r.status AS registration_status
       FROM test_batch_registrations r
       JOIN test_batch_students s
         ON UPPER(TRIM(s.roll_no))=UPPER(TRIM(r.roll_no))
       WHERE UPPER(TRIM(r.test_code))=UPPER(TRIM($1))
         AND r.status='Registered'
         AND s.test_series_id=$2
         AND (
           LOWER(TRIM(s.subjects))='both'
           OR LOWER(TRIM(s.subjects))=LOWER(TRIM($3))
         )
         ${studentFilters}
         ${registeredVisibilityFilter}
       ORDER BY r.writing_date ASC, r.slot_start ASC, s.roll_no ASC`,
      values
    );

    res.json({
      test,
      students: studentsResult.rows,
      registered_students: studentsResult.rows.length
    });
  } catch (err) {
    console.error('GET /test-batch/tests/:testCode/registered-students error:', err);
    res.status(500).json({ error: 'Failed to fetch registered Test Batch students' });
  }
});


function normalizeMarkEntrySubject(value) {
  const subject = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (subject === 'mathematics' || subject === 'maths' || subject === 'math') return 'mathematics';
  if (subject === 'physics' || subject === 'phy') return 'physics';
  return subject;
}

async function requireMarksEntryFaculty(req, res, next) {
  try {
    await ensureRecordAuditSchema();
    const candidate = String(
      req.get('x-admin-id') ||
      (req.body && req.body.adminId) ||
      req.query.adminId ||
      req.get('x-faculty-id') ||
      (req.body && req.body.facultyId) ||
      req.query.facultyId ||
      ''
    ).toUpperCase().trim();
    if (!/^IG\d{3,}$/.test(candidate)) {
      return res.status(403).json({ error: 'Faculty access is required to enter marks' });
    }
    const result = await pool.query(
      'SELECT faculty_id, name FROM faculty WHERE UPPER(TRIM(faculty_id))=$1 LIMIT 1',
      [candidate]
    );
    if (!result.rows.length) {
      return res.status(403).json({ error: 'Faculty account is not authorized' });
    }
    req.marksEntryFacultyId = candidate;
    req.recordAuditActor = { id: String(result.rows[0].faculty_id).trim().toUpperCase(), name: String(result.rows[0].name || '').trim() };
    next();
  } catch (error) {
    console.error('Marks-entry faculty authorization failed:', error);
    res.status(500).json({ error: 'Could not verify faculty access' });
  }
}

function validateMarkEntryTestCode(code) {
  const rawCode = String(code || '').trim().toUpperCase();
  if (!rawCode || /\\s/.test(rawCode)) return null;
  const parsed = parseRegularTestCode(rawCode);
  if (!parsed || parsed.attempt !== null) return null;
  const chapterNumber = Number(parsed.chapter);
  if (!/^\d{1,2}$/.test(String(parsed.chapter)) || !Number.isInteger(chapterNumber) ||
      chapterNumber < 1 || chapterNumber > 99 ||
      !Number.isInteger(parsed.totalMarks) || parsed.totalMarks < 1 || parsed.totalMarks > 999) {
    return null;
  }
  return parsed;
}

function markEntryBoardSql(column) {
  const raw = "REGEXP_REPLACE(LOWER(COALESCE(" + column + ",'')), '[^a-z]', '', 'g')";
  return "(CASE WHEN " + raw + " IN ('s','state','stateboard') THEN 'stateboard' " +
    "WHEN " + raw + " IN ('c','cbse') THEN 'cbse' " +
    "WHEN " + raw + " IN ('i','isc','icse') THEN 'isc' ELSE " + raw + " END)";
}

async function regularMarkEntryStudents(db, parsed, subjectId) {
  const result = await db.query(
    "SELECT DISTINCT s.roll_no, s.name, TRIM(s.class) AS class, TRIM(s.board) AS board " +
    "FROM students s JOIN student_subjects ss ON UPPER(TRIM(ss.roll_no))=UPPER(TRIM(s.roll_no)) " +
    "WHERE REGEXP_REPLACE(COALESCE(s.class,''), '[^0-9]', '', 'g')=$1 " +
    "AND " + markEntryBoardSql('s.board') + "=$2 " +
    "AND ss.subject_id=$3 " +
    "AND (s.batch IS NULL OR LOWER(TRIM(s.batch))='regular batch') " +
    "ORDER BY s.roll_no ASC",
    [parsed.className, normalizeTestBatchBoard(parsed.board), Number(subjectId)]
  );
  return result.rows;
}

async function regularMarkEntrySubjectId(db, parsed) {
  const aliases = parsed.subjectCode === 'M'
    ? ['mathematics', 'maths', 'math']
    : ['physics', 'phy'];
  const result = await db.query(
    'SELECT subject_id FROM subjects WHERE LOWER(TRIM(subject_name))=ANY($1::text[]) LIMIT 1',
    [aliases]
  );
  return result.rows.length ? Number(result.rows[0].subject_id) : null;
}

app.get('/regular-mark-entry/:testCode', requireMarksEntryFaculty, async (req, res) => {
  try {
    const code = String(req.params.testCode || '').trim().toUpperCase();
    const parsed = validateMarkEntryTestCode(code);
    if (!parsed) return res.status(400).json({ error: 'Invalid test code format or test details' });

    const existingTestResult = await pool.query(
      "SELECT test_date,total_marks,chapter,portion,class,board FROM tests WHERE UPPER(TRIM(test_code))=$1 LIMIT 1",
      [parsed.canonicalCode]
    );
    const existingMarksResult = await pool.query(
      "SELECT roll_no,marks_obtained,comments,total_marks FROM marks WHERE UPPER(TRIM(test_code))=$1 ORDER BY roll_no ASC",
      [parsed.canonicalCode]
    );

    const subjectId = await regularMarkEntrySubjectId(pool, parsed);
    if (!subjectId) return res.status(400).json({ error: 'The subject is not configured in the database' });

    const students = await regularMarkEntryStudents(pool, parsed, subjectId);
    if (!students.length) {
      return res.status(404).json({ error: 'No eligible students found for this test code' });
    }

    const savedTest = existingTestResult.rows[0] || {};
    res.json({
      test: {
        test_code: parsed.canonicalCode,
        board: savedTest.board || parsed.board,
        class: savedTest.class || parsed.className,
        subject: parsed.subjectName,
        subject_id: subjectId,
        total_marks: Number(savedTest.total_marks || parsed.totalMarks),
        chapter: savedTest.chapter || parsed.chapter,
        test_date: savedTest.test_date || null
      },
      students,
      marks: existingMarksResult.rows
    });
  } catch (error) {
    console.error('GET /regular-mark-entry/:testCode failed:', error);
    res.status(500).json({ error: 'Could not load students and saved marks for this test code' });
  }
});

app.post('/regular-mark-entry/submit', requireMarksEntryFaculty, async (req, res) => {
  const client = await pool.connect();
  try {
    const code = String((req.body && req.body.testCode) || '').trim().toUpperCase();
    const parsed = validateMarkEntryTestCode(code);
    const records = req.body && req.body.records;
    if (!parsed) return res.status(400).json({ error: 'Invalid test code format or test details' });
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Marks are required for every student' });
    }

    const subjectId = await regularMarkEntrySubjectId(client, parsed);
    if (!subjectId) return res.status(400).json({ error: 'The subject is not configured in the database' });

    await client.query('BEGIN');
    const existingTestResult = await client.query(
      "SELECT test_code,test_date,total_marks,subject_id FROM tests WHERE UPPER(TRIM(test_code))=$1 FOR UPDATE",
      [parsed.canonicalCode]
    );
    const existingMarksResult = await client.query(
      "SELECT roll_no,marks_obtained,total_marks FROM marks WHERE UPPER(TRIM(test_code))=$1 FOR UPDATE",
      [parsed.canonicalCode]
    );
    const existingMarks = existingMarksResult.rows;
    const isMarksAdmin = ['IG001', 'IG002'].includes(String(req.marksEntryFacultyId || '').trim().toUpperCase());
    if (existingMarks.length && !isMarksAdmin) {
      throw Object.assign(new Error('Saved marks exist for this test. Faculty must request admin edit approval.'), { statusCode: 403 });
    }

    const students = await regularMarkEntryStudents(client, parsed, subjectId);
    if (!students.length) {
      throw Object.assign(new Error('No eligible students found for this test code'), { statusCode: 404 });
    }

    const eligibleByRoll = new Map(students.map((student) => [String(student.roll_no).trim().toUpperCase(), student]));
    const recordByRoll = new Map();
    for (const record of records) {
      const roll = String((record && record.roll_no) || '').trim().toUpperCase();
      if (!roll || recordByRoll.has(roll)) {
        throw Object.assign(new Error('Marks contain a missing or repeated student'), { statusCode: 400 });
      }
      if (!eligibleByRoll.has(roll)) {
        throw Object.assign(new Error('Marks include a student who is not eligible for this test'), { statusCode: 400 });
      }
      recordByRoll.set(roll, String(record.marks == null ? '' : record.marks).trim().toUpperCase());
    }
    if (recordByRoll.size !== eligibleByRoll.size ||
        Array.from(eligibleByRoll.keys()).some((roll) => !recordByRoll.has(roll))) {
      throw Object.assign(new Error('Marks must be entered for every eligible student'), { statusCode: 400 });
    }

    const className = students[0].class;
    const board = students[0].board;
    if (existingTestResult.rows.length) {
      await client.query(
        "UPDATE tests SET test_date=COALESCE($1::date,test_date),subject_id=$2,total_marks=$3," +
        "portion=COALESCE(portion,$4),chapter=COALESCE(chapter,$5),class=COALESCE(class,$6),board=COALESCE(board,$7) " +
        "WHERE UPPER(TRIM(test_code))=$8",
        [req.body.testDate || null,subjectId,parsed.totalMarks,'Chapter ' + parsed.chapter,parsed.chapter,className,board,parsed.canonicalCode]
      );
    } else {
      await client.query(
        'INSERT INTO tests (test_code,test_date,subject_id,total_marks,portion,chapter,class,board,created_by) ' +
        'VALUES ($1,COALESCE($2::date,CURRENT_DATE),$3,$4,$5,$6,$7,$8,$9)',
        [
          parsed.canonicalCode,
          req.body.testDate || null,
          subjectId,
          parsed.totalMarks,
          'Chapter ' + parsed.chapter,
          parsed.chapter,
          className,
          board,
          req.marksEntryFacultyId
        ]
      );
    }

    const queuedGroups = new Map();
    for (const student of students) {
      const marks = recordByRoll.get(String(student.roll_no).trim().toUpperCase());
      if (marks !== 'A') {
        const number = Number(marks);
        if (!/^\d+$/.test(marks) || !Number.isInteger(number) || number < 0 ||
            number > 100000 || number > parsed.totalMarks) {
          throw Object.assign(new Error('One or more marks are outside the allowed range'), { statusCode: 400 });
        }
      }
      const updatedMark = await client.query(
        'UPDATE marks SET student_name=$1,marks_obtained=$2,comments=$3,total_marks=$4,updated_by=$7,updated_by_name=$8,updated_at=CURRENT_TIMESTAMP ' +
        'WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($5)) AND UPPER(TRIM(test_code))=UPPER(TRIM($6))',
        [student.name,marks,marks === 'A' ? 'Absent' : null,parsed.totalMarks,student.roll_no,parsed.canonicalCode,req.recordAuditActor.id,req.recordAuditActor.name]
      );
      if (!updatedMark.rowCount) {
        await client.query(
          'INSERT INTO marks (roll_no,student_name,test_code,marks_obtained,comments,total_marks,entered_by,entered_by_name,entered_at,updated_by,updated_by_name,updated_at) ' +
          'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$7,$8,CURRENT_TIMESTAMP)',
          [student.roll_no,student.name,parsed.canonicalCode,marks,marks === 'A' ? 'Absent' : null,parsed.totalMarks,req.recordAuditActor.id,req.recordAuditActor.name]
        );
      }
      await client.query(
        "DELETE FROM student_notifications WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1)) AND module_name='marks'",
        [student.roll_no]
      );
      await client.query(
        "INSERT INTO student_notifications (roll_no,module_name,message,is_read) VALUES ($1,'marks','New marks have been uploaded',FALSE)",
        [student.roll_no]
      );
      const eventKey = makeEventKey('marks', parsed.canonicalCode, student.class, student.board);
      queuedGroups.set(eventKey, {
        eventKey,
        moduleName: 'marks',
        className: student.class,
        board: student.board,
        subjectId: subjectId,
        title: 'Marks posted',
        message: 'Marks for ' + parsed.canonicalCode + ' have been posted',
        payload: { test_code: parsed.canonicalCode, total_marks: parsed.totalMarks }
      });
    }

    for (const event of queuedGroups.values()) {
      await queueNotificationEvent(client, event);
    }
    await client.query('COMMIT');
    res.status(existingMarks.length ? 200 : 201).json({ message: existingMarks.length ? 'Marks updated successfully' : 'Marks saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST /regular-mark-entry/submit failed:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Could not save marks. Please try again.'
    });
  } finally {
    client.release();
  }
});

app.get('/test-batch/mark-entry/subjects', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT TRIM(subject_name) AS subject_name FROM test_batch_tests " +
      "WHERE status NOT IN ('Draft','Cancelled') AND " +
      "(manual_mark_entry_enabled=TRUE OR EXISTS (SELECT 1 FROM test_batch_marks m " +
      "WHERE UPPER(TRIM(m.test_code))=UPPER(TRIM(test_batch_tests.test_code)))) " +
      "ORDER BY TRIM(subject_name) ASC"
    );
    res.json({ subjects: result.rows });
  } catch (error) {
    console.error('GET Test Batch mark-entry subjects failed:', error);
    res.status(500).json({ error: 'Could not load available subjects' });
  }
});

app.get('/test-batch/mark-entry/tests', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  try {
    const subject = String(req.query.subject || '').trim();
    if (!subject) return res.status(400).json({ error: 'Choose a subject first' });
    const result = await pool.query(
      "SELECT t.test_code,t.subject_name,t.test_series_id,ts.name AS test_series_name,t.total_marks," +
      "t.status,t.marks_entry_status,t.manual_mark_entry_enabled " +
      "FROM test_batch_tests t JOIN test_series ts ON ts.id=t.test_series_id " +
      "WHERE LOWER(TRIM(t.subject_name))=LOWER(TRIM($1)) " +
      "AND t.status NOT IN ('Draft','Cancelled') AND " +
      "(t.manual_mark_entry_enabled=TRUE OR EXISTS (SELECT 1 FROM test_batch_marks m WHERE UPPER(TRIM(m.test_code))=UPPER(TRIM(t.test_code)))) " +
      "AND (EXISTS (SELECT 1 FROM test_batch_registrations r WHERE r.test_code=t.test_code AND r.status='Registered') " +
      "OR EXISTS (SELECT 1 FROM test_batch_marks m WHERE UPPER(TRIM(m.test_code))=UPPER(TRIM(t.test_code)))) " +
      "ORDER BY t.test_code ASC",
      [subject]
    );
    const tests = result.rows.map((test) => {
      const parsed = parseTestBatchCode(test.test_code);
      return parsed ? Object.assign({}, test, { class: String(Number(parsed.className)), board: parsed.board }) : null;
    }).filter(Boolean).filter((test) =>
      normalizeMarkEntrySubject(test.subject_name) === normalizeMarkEntrySubject(parseTestBatchCode(test.test_code).subject)
    );
    res.json({ tests });
  } catch (error) {
    console.error('GET Test Batch mark-entry tests failed:', error);
    res.status(500).json({ error: 'Could not load tests for the selected subject' });
  }
});

app.get('/test-batch/tests/:testCode/mark-entry', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  try {
    const code = String(req.params.testCode || '').trim().toUpperCase();
    const testResult = await pool.query(
      "SELECT t.*,ts.name AS test_series_name FROM test_batch_tests t " +
      "JOIN test_series ts ON ts.id=t.test_series_id WHERE UPPER(TRIM(t.test_code))=$1 LIMIT 1",
      [code]
    );
    if (!testResult.rows.length) return res.status(404).json({ error: 'Test not found' });
    const test = testResult.rows[0];
    const parsed = parseTestBatchCode(test.test_code);
    if (!parsed || normalizeMarkEntrySubject(parsed.subject) !== normalizeMarkEntrySubject(test.subject_name) ||
        Number(parsed.totalMarks) !== Number(test.total_marks)) {
      return res.status(400).json({ error: 'Test code details do not match the posted test' });
    }
    const existingMarksResult = await pool.query(
      "SELECT roll_no,marks_obtained,comments,total_marks FROM test_batch_marks " +
      "WHERE UPPER(TRIM(test_code))=$1 AND LOWER(TRIM(subject_name))=LOWER(TRIM($2)) ORDER BY roll_no ASC",
      [code,test.subject_name]
    );
    const existingMarks = existingMarksResult.rows;
    if ((!test.manual_mark_entry_enabled && !existingMarks.length) || ['Draft','Cancelled'].includes(test.status)) {
      return res.status(409).json({ error: 'Marks are not available for entry for this test' });
    }
    const aliases = normalizeMarkEntrySubject(test.subject_name) === 'mathematics'
      ? ['mathematics','maths','math','both']
      : ['physics','phy','both'];
    const studentsResult = await pool.query(
      "SELECT DISTINCT s.roll_no,s.name,TRIM(s.class) AS class,TRIM(s.board) AS board " +
      "FROM test_batch_registrations r JOIN test_batch_students s ON UPPER(TRIM(s.roll_no))=UPPER(TRIM(r.roll_no)) " +
      "JOIN test_batch_tests t ON t.test_code=r.test_code " +
      "WHERE UPPER(TRIM(r.test_code))=$1 " +
      "AND (r.status='Registered' OR EXISTS (SELECT 1 FROM test_batch_marks m " +
      "WHERE UPPER(TRIM(m.test_code))=$1 AND UPPER(TRIM(m.roll_no))=UPPER(TRIM(s.roll_no)) " +
      "AND LOWER(TRIM(m.subject_name))=LOWER(TRIM(t.subject_name)))) " +
      "AND s.test_series_id=t.test_series_id " +
      "AND LOWER(TRIM(COALESCE(s.subjects,'')))=ANY($2::text[]) " +
      "AND REGEXP_REPLACE(COALESCE(s.class,''),'[^0-9]','','g')=$3 " +
      "AND " + markEntryBoardSql('s.board') + "=$4 " +
      "ORDER BY s.roll_no ASC",
      [code, aliases, String(Number(parsed.className)), normalizeTestBatchBoard(parsed.board)]
    );
    if (!studentsResult.rows.length) return res.status(404).json({ error: 'No registered students found for this test' });
    res.json({
      test: {
        test_code: test.test_code,
        test_series_id: test.test_series_id,
        test_series_name: test.test_series_name,
        subject_name: test.subject_name,
        total_marks: Number(test.total_marks),
        class: String(Number(parsed.className)),
        board: parsed.board,
        marks_entry_status: test.marks_entry_status,
        test_date: test.test_date || test.writing_close_date || null
      },
      students: studentsResult.rows,
      marks: existingMarks
    });
  } catch (error) {
    console.error('GET Test Batch mark-entry students failed:', error);
    res.status(500).json({ error: 'Could not load registered students for marks entry' });
  }
});

app.post('/test-batch/tests/:testCode/marks/submit', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  const client = await pool.connect();
  try {
    const code = String(req.params.testCode || '').trim().toUpperCase();
    const records = req.body && req.body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Marks are required for every registered student' });
    }

    await client.query('BEGIN');
    const testResult = await client.query(
      'SELECT t.*,ts.name AS test_series_name FROM test_batch_tests t ' +
      'JOIN test_series ts ON ts.id=t.test_series_id WHERE UPPER(TRIM(t.test_code))=$1 FOR UPDATE',
      [code]
    );
    if (!testResult.rows.length) {
      throw Object.assign(new Error('Test not found'), { statusCode: 404 });
    }
    const test = testResult.rows[0];
    const parsed = parseTestBatchCode(test.test_code);
    if (!parsed || normalizeMarkEntrySubject(parsed.subject) !== normalizeMarkEntrySubject(test.subject_name) ||
        Number(parsed.totalMarks) !== Number(test.total_marks)) {
      throw Object.assign(new Error('Test code details do not match the posted test'), { statusCode: 400 });
    }
    const existingMarksResult = await client.query(
      'SELECT roll_no,marks_obtained,total_marks FROM test_batch_marks ' +
      'WHERE UPPER(TRIM(test_code))=$1 AND LOWER(TRIM(subject_name))=LOWER(TRIM($2)) FOR UPDATE',
      [code,test.subject_name]
    );
    const existingMarks = existingMarksResult.rows;
    const isMarksAdmin = ['IG001','IG002'].includes(String(req.testBatchFacultyId || '').trim().toUpperCase());
    if (['Draft','Cancelled'].includes(test.status) || (!test.manual_mark_entry_enabled && !existingMarks.length)) {
      throw Object.assign(new Error('Marks are not available for entry'), { statusCode: 409 });
    }
    if (test.marks_entry_status === 'Finalized' && !existingMarks.length) {
      throw Object.assign(new Error('Marks have already been finalized'), { statusCode: 409 });
    }
    if (existingMarks.length && !isMarksAdmin) {
      throw Object.assign(new Error('Saved marks exist for this test. Faculty must request admin edit approval.'), { statusCode: 403 });
    }

    const aliases = normalizeMarkEntrySubject(test.subject_name) === 'mathematics'
      ? ['mathematics','maths','math','both']
      : ['physics','phy','both'];
    const studentsResult = await client.query(
      "SELECT DISTINCT s.roll_no,s.name,TRIM(s.class) AS class,TRIM(s.board) AS board " +
      "FROM test_batch_registrations r JOIN test_batch_students s ON UPPER(TRIM(s.roll_no))=UPPER(TRIM(r.roll_no)) " +
      "WHERE UPPER(TRIM(r.test_code))=$1 AND r.status='Registered' " +
      "AND s.test_series_id=$2 " +
      "AND LOWER(TRIM(COALESCE(s.subjects,'')))=ANY($3::text[]) " +
      "AND REGEXP_REPLACE(COALESCE(s.class,''),'[^0-9]','','g')=$4 " +
      "AND " + markEntryBoardSql('s.board') + "=$5 " +
      "ORDER BY s.roll_no ASC",
      [code,Number(test.test_series_id),aliases,String(Number(parsed.className)),normalizeTestBatchBoard(parsed.board)]
    );
    const students = studentsResult.rows;
    if (!students.length) {
      throw Object.assign(new Error('No registered students found for this test'), { statusCode: 404 });
    }

    const eligible = new Map(students.map((student) => [String(student.roll_no).trim().toUpperCase(),student]));
    const entered = new Map();
    for (const record of records) {
      const roll = String((record && record.roll_no) || '').trim().toUpperCase();
      if (!roll || entered.has(roll)) {
        throw Object.assign(new Error('Marks contain a missing or repeated student'), { statusCode: 400 });
      }
      if (!eligible.has(roll)) {
        throw Object.assign(new Error('Marks include a student who is not registered for this test'), { statusCode: 400 });
      }
      entered.set(roll,String(record.marks == null ? '' : record.marks).trim().toUpperCase());
    }
    if (entered.size !== eligible.size || Array.from(eligible.keys()).some((roll) => !entered.has(roll))) {
      throw Object.assign(new Error('Marks must be entered for every registered student'), { statusCode: 400 });
    }

    for (const student of students) {
      const marks = entered.get(String(student.roll_no).trim().toUpperCase());
      let cleanMarks = marks;
      if (marks !== 'A') {
        const number = Number(marks);
        if (!/^\d+$/.test(marks) || !Number.isInteger(number) || number < 0 ||
            number > 100000 || number > Number(test.total_marks)) {
          throw Object.assign(new Error('One or more marks are outside the allowed range'), { statusCode: 400 });
        }
      }
      const updatedMark = await client.query(
        'UPDATE test_batch_marks SET total_marks=$1,marks_obtained=$2,comments=$3,updated_by=$7,updated_by_name=$8,updated_at=CURRENT_TIMESTAMP ' +
        'WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($4)) AND UPPER(TRIM(test_code))=UPPER(TRIM($5)) ' +
        'AND LOWER(TRIM(subject_name))=LOWER(TRIM($6))',
        [Number(test.total_marks),cleanMarks,cleanMarks === 'A' ? 'Absent' : null,student.roll_no,code,test.subject_name,req.recordAuditActor.id,req.recordAuditActor.name]
      );
      if (!updatedMark.rowCount) {
        await client.query(
          'INSERT INTO test_batch_marks (roll_no,test_code,subject_name,total_marks,marks_obtained,comments,entered_by,entered_by_name,entered_at,updated_by,updated_by_name) ' +
          'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$7,$8)',
          [student.roll_no,code,test.subject_name,Number(test.total_marks),cleanMarks,cleanMarks === 'A' ? 'Absent' : null,req.recordAuditActor.id,req.recordAuditActor.name]
        );
      }
    }

    if (!existingMarks.length) {
      await client.query(
        "UPDATE test_batch_tests SET marks_entry_status='Finalized',marks_finalized_at=CURRENT_TIMESTAMP,marks_finalized_by=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2",
        [req.testBatchFacultyId,Number(test.id)]
      );
    } else {
      await client.query("UPDATE test_batch_tests SET updated_at=CURRENT_TIMESTAMP WHERE id=$1", [Number(test.id)]);
    }
    await client.query('COMMIT');
    res.status(existingMarks.length ? 200 : 201).json({ message: existingMarks.length ? 'Test Batch marks updated successfully' : 'Test Batch marks saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST Test Batch marks submission failed:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Could not save Test Batch marks'
    });
  } finally {
    client.release();
  }
});

app.get('/test-batch/series', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM test_series ORDER BY id ASC');
    res.json({ series: result.rows });
  } catch (err) {
    console.error('GET /test-batch/series error:', err);
    res.status(500).json({ error: 'Failed to fetch Test Batch series' });
  }
});

app.get('/test-batch/students/next-roll', requireTestBatchAttendanceMarksAccess, async (req, res) => {
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

app.get('/test-batch/students', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  try {
    const { search, seriesId, class: className } = req.query;
    const values = [];
    let where = 'WHERE 1=1';

    if (seriesId) {
      values.push(Number(seriesId));
      where += ' AND s.test_series_id = $' + values.length;
    }

    if (className) {
      values.push(String(className).trim());
      where += ' AND s.class = $' + values.length;
    }

    if (search) {
      values.push('%' + String(search).trim() + '%');
      where += ' AND (s.roll_no ILIKE $' + values.length + ' OR s.name ILIKE $' + values.length + ')';
    }

    const result = await pool.query(
      'SELECT s.roll_no,s.name,s.class,s.board,s.mode_of_education,s.phone,s.email,s.school_name,s.subjects,' +
      's.date_of_birth,s.academic_year_from,s.academic_year_to,s.parent_name,s.secondary_contact,s.reference,' +
      's.created_at,s.updated_at,s.test_series_id,ts.name AS test_series_name ' +
      'FROM test_batch_students s JOIN test_series ts ON ts.id=s.test_series_id ' +
      where + ' ORDER BY s.roll_no ASC',
      values
    );

    const classValues = [];
    let classWhere = 'WHERE 1=1';

    if (seriesId) {
      classValues.push(Number(seriesId));
      classWhere += ' AND s.test_series_id = $' + classValues.length;
    }

    if (search) {
      classValues.push('%' + String(search).trim() + '%');
      classWhere += ' AND (s.roll_no ILIKE $' + classValues.length + ' OR s.name ILIKE $' + classValues.length + ')';
    }

    const classResult = await pool.query(
      'SELECT DISTINCT TRIM(s.class) AS class FROM test_batch_students s ' +
      classWhere +
      " AND s.class IS NOT NULL AND TRIM(s.class) <> '' " +
      'ORDER BY TRIM(s.class) ASC',
      classValues
    );

    res.json({
      students: result.rows,
      available_classes: classResult.rows
        .map((row) => String(row.class).trim())
        .filter(Boolean)
    });
  } catch (err) {
    console.error('GET /test-batch/students error:', err);
    res.status(500).json({ error: 'Failed to fetch Test Batch students' });
  }
});

app.post('/test-batch/students', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      enquiry_id, admission_token, roll_no,
      name, class: className, board, mode_of_education,
      phone, email, school_name, password, test_series_id, subjects,
      date_of_birth, academic_year_from, academic_year_to,
      parent_name, secondary_contact, reference
    } = req.body || {};

    const cleanRollNo = String(roll_no || '').trim().toUpperCase();
    if (!cleanRollNo) return res.status(400).json({ error:'Roll number is required; enter it manually.' });
    if (!/^IAT[0-9]{3,}$/.test(cleanRollNo)) return res.status(400).json({ error:'Test Batch roll number must use the IAT format, for example IAT014.' });
    if (!name || !className || !test_series_id || !subjects) {
      return res.status(400).json({ error:'Roll number, student name, class, subjects and test series are required' });
    }
    if (academic_year_from && !/^\d{4}$/.test(String(academic_year_from))) return res.status(400).json({ error:'Academic Year From must be a four-digit year.' });
    if (academic_year_to && !/^\d{4}$/.test(String(academic_year_to))) return res.status(400).json({ error:'Academic Year To must be a four-digit year.' });
    if (academic_year_from && academic_year_to && Number(academic_year_to) <= Number(academic_year_from)) return res.status(400).json({ error:'Academic Year To must be later than Academic Year From.' });

    const validSubjects = validateTestBatchSubjects(subjects);
    if (!validSubjects) return res.status(400).json({ error:'Select Mathematics, Physics or Both' });

    if (!await validateTestBatchSeries(test_series_id)) {
      return res.status(400).json({ error:'Invalid Test Series' });
    }

    // Normalize optional email values so whitespace is stored as NULL, not an empty string.
    const normalizedEmail = email == null ? null : (String(email).trim().toLowerCase() || null);

    await client.query('BEGIN');

    if (enquiry_id) {
      const admissionLock = await client.query(
        `SELECT id FROM enquiries
         WHERE id=$1 AND status IN ('Pending','Admission In Progress') AND admission_token=$2
         FOR UPDATE`,
        [enquiry_id, String(admission_token || '')]
      );
      if (!admissionLock.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error:'This admission session expired or is no longer active. Reopen the enquiry and try again.' });
      }
    }

    const duplicateRoll = await client.query(
      'SELECT 1 FROM test_batch_students WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1)) LIMIT 1',
      [cleanRollNo]
    );
    if (duplicateRoll.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error:'This Test Batch roll number already exists. Please enter a different roll number.' });
    }

    const rollNo = cleanRollNo;
    const finalPassword = password && String(password).trim()
      ? String(password).trim()
      : rollNo;

    const inserted = await client.query(
      'INSERT INTO test_batch_students ' +
      '(roll_no,name,class,board,mode_of_education,phone,email,school_name,subjects,password,must_reset_password,test_series_id,created_by,date_of_birth,academic_year_from,academic_year_to,parent_name,secondary_contact,reference) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT DO NOTHING RETURNING roll_no',
      [
        rollNo,
        String(name).trim(),
        className ? String(className).trim() : null,
        board ? String(board).trim() : null,
        mode_of_education ? String(mode_of_education).trim() : null,
        phone ? String(phone).trim() : null,
        normalizedEmail,
        school_name ? String(school_name).trim() : null,
        validSubjects,
        finalPassword,
        Number(test_series_id),
        req.testBatchAdminId,
        date_of_birth || null,
        academic_year_from || null,
        academic_year_to || null,
        parent_name || null,
        secondary_contact || null,
        reference || null
      ]
    );

    if (!inserted.rows.length) {
      const emailExists = normalizedEmail
        ? await client.query(
            'SELECT 1 FROM test_batch_students WHERE LOWER(TRIM(email))=LOWER(TRIM($1)) LIMIT 1',
            [normalizedEmail]
          )
        : { rows: [] };
      await client.query('ROLLBACK');
      if (emailExists.rows.length) {
        return res.status(409).json({ error:'Email already exists in Test Batch' });
      }
      return res.status(409).json({ error:'Could not allocate a unique Test Batch roll number. Please retry.' });
    }

    if (enquiry_id) {
      const admitted = await client.query(
        `UPDATE enquiries
         SET status='Admitted', admission_token=NULL, admission_started_at=NULL, comment=NULL, reason=NULL
         WHERE id=$1 AND status IN ('Pending','Admission In Progress') AND admission_token=$2
         RETURNING id`,
        [enquiry_id, String(admission_token || '')]
      );
      if (!admitted.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error:'Admission session changed before the student could be saved. No student was created; please reopen the enquiry.' });
      }
      await client.query('DELETE FROM enquiry_admission_drafts WHERE enquiry_id=$1', [enquiry_id]);
    }

    await client.query('COMMIT');
    res.status(201).json({ message:'Test Batch student added successfully', roll_no:rollNo, admitted_enquiry_id:enquiry_id || null });
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

app.put('/test-batch/students/:roll_no', requireTestBatchAttendanceMarksAccess, async (req, res) => {
  const client = await pool.connect();

  try {
    const oldRoll = String(req.params.roll_no).toUpperCase().trim();
    const {
      name, class: className, board, mode_of_education,
      phone, email, school_name, password, test_series_id, subjects,
      date_of_birth, academic_year_from, academic_year_to,
      parent_name, secondary_contact, reference
    } = req.body || {};

    if (!name || !className || !test_series_id || !subjects) return res.status(400).json({ error:'Student name, class, subjects and test series are required' });
    if (academic_year_from && !/^\d{4}$/.test(String(academic_year_from))) return res.status(400).json({ error:'Academic Year From must be a four-digit year.' });
    if (academic_year_to && !/^\d{4}$/.test(String(academic_year_to))) return res.status(400).json({ error:'Academic Year To must be a four-digit year.' });
    if (academic_year_from && academic_year_to && Number(academic_year_to) <= Number(academic_year_from)) return res.status(400).json({ error:'Academic Year To must be later than Academic Year From.' });
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
      Number(test_series_id),
      date_of_birth || null,
      academic_year_from || null,
      academic_year_to || null,
      parent_name || null,
      secondary_contact || null,
      reference || null
    ];

    let query =
      'UPDATE test_batch_students SET name=$1,class=$2,board=$3,mode_of_education=$4,' +
      'phone=$5,email=$6,school_name=$7,subjects=$8,test_series_id=$9,date_of_birth=$10,' +
      'academic_year_from=$11,academic_year_to=$12,parent_name=$13,secondary_contact=$14,reference=$15,' +
      'updated_at=CURRENT_TIMESTAMP';

    if (password && String(password).trim()) {
      values.push(String(password).trim(), oldRoll);
      query += ',password=$16,must_reset_password=TRUE WHERE UPPER(TRIM(roll_no))=$17 RETURNING roll_no';
    } else {
      values.push(oldRoll);
      query += ' WHERE UPPER(TRIM(roll_no))=$16 RETURNING roll_no';
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

app.delete('/test-batch/students/:roll_no', requireTestBatchAttendanceMarksAccess, async (req,res) => {
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

app.get('/test-batch/marks', requireTestBatchAttendanceMarksAccess, async (req,res) => {
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
      'm.total_marks,m.marks_obtained,m.comments,m.created_at,m.updated_at,m.entered_by,m.entered_by_name,m.entered_at,m.updated_by,m.updated_by_name,m.updated_at ' +
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

app.post('/test-batch/marks', requireTestBatchAttendanceMarksAccess, async (req,res) => {
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
      'INSERT INTO test_batch_marks(roll_no,test_code,subject_name,total_marks,marks_obtained,comments,entered_by,entered_by_name,entered_at,updated_by,updated_by_name) ' +
      'VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$7,$8) RETURNING *',
      [
        String(roll_no).trim().toUpperCase(),
        String(test_code).trim(),
        String(subject_name).trim(),
        Number(total_marks),
        validation.obtained,
        comments ? String(comments).trim() : null,
        req.recordAuditActor.id,
        req.recordAuditActor.name
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
      'comments=$5,updated_by=$6,updated_by_name=$7,updated_at=CURRENT_TIMESTAMP WHERE id=$8 RETURNING *',
      [String(test_code).trim(),String(subject_name).trim(),Number(total_marks),validation.obtained,comments ? String(comments).trim() : null,req.recordAuditActor.id,req.recordAuditActor.name,Number(req.params.id)]
    );

    if (result.rows.length===0) return res.status(404).json({ error:'Test Batch mark not found' });
    res.json({ message:'Test Batch mark updated successfully', mark:marksComputedFields(result.rows[0]) });
  } catch (err) {
    console.error('PUT /test-batch/marks/:id error:', err);
    if (err.code === '23505') return res.status(400).json({ error:'Mark already exists for this student, test and subject' });
    res.status(500).json({ error:'Failed to update Test Batch mark' });
  }
});

app.delete('/test-batch/marks/:id', requireTestBatchAttendanceMarksAccess, async (req,res) => {
  try {
    const result = await pool.query('DELETE FROM test_batch_marks WHERE id=$1 RETURNING id', [Number(req.params.id)]);
    if (result.rows.length===0) return res.status(404).json({ error:'Test Batch mark not found' });
    res.json({ message:'Test Batch mark deleted successfully' });
  } catch (err) {
    console.error('DELETE /test-batch/marks/:id error:', err);
    res.status(500).json({ error:'Failed to delete Test Batch mark' });
  }
});

app.get('/test-batch/attendance', requireTestBatchAttendanceMarksAccess, async (req,res) => {
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
          s.academic_year_from,
          s.academic_year_to,
          ts.name AS test_series_name,
          (
            SELECT STRING_AGG(DISTINCT TRIM(tr.test_code), ', ' ORDER BY TRIM(tr.test_code))
            FROM test_batch_registrations tr
            WHERE UPPER(TRIM(tr.roll_no)) = UPPER(TRIM(s.roll_no))
              AND tr.writing_date = $1
          ) AS test_codes,
          a.id,
          a.attendance_date,
          a.status,
          a.marked_by, a.marked_by_name,
          a.marked_at,
          a.edited_by, a.edited_by_name,
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
          FROM test_batch_registrations tr
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

app.post('/test-batch/attendance', requireTestBatchAttendanceMarksAccess, async (req,res) => {
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
        throw new Error('Each attendance record needs a valid roll number and status');
      }

      const student = await client.query(
        'SELECT roll_no FROM test_batch_students WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1))',
        [roll]
      );

      if (student.rows.length===0) {
        throw new Error('Test Batch student not found: ' + roll);
      }

      const registration = await client.query(
        `SELECT 1
         FROM test_batch_registrations tr
         WHERE UPPER(TRIM(tr.roll_no))=UPPER(TRIM($1))
           AND tr.writing_date=$2::date
           AND tr.status='Registered'
         LIMIT 1`,
        [roll, attendanceDate]
      );

      if (registration.rows.length===0) {
        throw new Error(`No registered test application found for ${roll} on ${attendanceDate}`);
      }

      // Faculty can create attendance, but changing a saved status requires
      // an approved Test Batch edit request.
      const savedAttendance = await client.query(
        `SELECT status FROM test_batch_attendance
         WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1)) AND attendance_date=$2::date
         FOR UPDATE`,
        [roll, attendanceDate]
      );
      if (req.testBatchFacultyId && savedAttendance.rows.length &&
          String(savedAttendance.rows[0].status) !== status) {
        throw new Error('Attendance is already saved. Request edit permission from an admin before changing it.');
      }

      // Update unchanged saved values safely, or create a new attendance record.
      await client.query(
        `INSERT INTO test_batch_attendance
          (roll_no,attendance_date,status,marked_by,marked_by_name,marked_at,edited_by,edited_by_name,edited_at)
         VALUES($1,$2::date,$3,$4,$5,CURRENT_TIMESTAMP,NULL,NULL,NULL)
         ON CONFLICT(roll_no,attendance_date) DO UPDATE SET
           status=EXCLUDED.status,
           edited_by=EXCLUDED.marked_by,
           edited_by_name=EXCLUDED.marked_by_name,
           edited_at=CURRENT_TIMESTAMP`,
        [roll,attendanceDate,status,req.recordAuditActor.id,req.recordAuditActor.name]
      );

      if (status === 'Absent') {
        // Automatically write A for every registered test the student had
        // on this writing date, including when an earlier numeric mark exists.
        const registeredTests = await client.query(
          `SELECT DISTINCT t.test_code,t.subject_name,t.total_marks
           FROM test_batch_registrations r
           JOIN test_batch_tests t
             ON UPPER(TRIM(t.test_code))=UPPER(TRIM(r.test_code))
           WHERE UPPER(TRIM(r.roll_no))=UPPER(TRIM($1))
             AND r.writing_date=$2::date
             AND r.status='Registered'`,
          [roll, attendanceDate]
        );

        for (const test of registeredTests.rows) {
          const previousMark = await client.query(
            `SELECT marks_obtained FROM test_batch_marks
             WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1))
               AND UPPER(TRIM(test_code))=UPPER(TRIM($2))
               AND LOWER(TRIM(subject_name))=LOWER(TRIM($3))
             FOR UPDATE`,
            [roll, test.test_code, test.subject_name]
          );
          if (req.testBatchFacultyId && previousMark.rows.length &&
              String(previousMark.rows[0].marks_obtained).trim().toUpperCase() !== 'A') {
            throw new Error('A saved mark exists for ' + roll + ' in ' + test.test_code + '. Request admin approval before changing it to absent.');
          }
          await client.query(
            `INSERT INTO test_batch_marks
              (roll_no,test_code,subject_name,total_marks,marks_obtained,comments,created_at,updated_at,entered_by,entered_by_name,entered_at,updated_by,updated_by_name)
             VALUES($1,$2,$3,$4,'A',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$5,$6,CURRENT_TIMESTAMP,$5,$6)
             ON CONFLICT(roll_no,test_code,subject_name) DO UPDATE SET
               total_marks=EXCLUDED.total_marks,
               marks_obtained='A',
               updated_by=$5,
               updated_by_name=$6,
               updated_at=CURRENT_TIMESTAMP`,
            [roll,test.test_code,test.subject_name,Number(test.total_marks),req.recordAuditActor.id,req.recordAuditActor.name]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ message:'Test Batch attendance and absent marks saved successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /test-batch/attendance error:', err);
    res.status(err.code ? 500 : 400).json({
      error: err.message || 'Failed to save Test Batch attendance',
      ...(err.code ? { details: err.message } : {})
    });
  } finally {
    client.release();
  }
});

app.put('/test-batch/attendance/:id', requireTestBatchAdmin, async (req,res) => {
  const client = await pool.connect();
  try {
    const status = String(req.body?.status || '').trim();
    if (!['Present','Absent'].includes(status)) {
      return res.status(400).json({ error:'Invalid attendance status' });
    }

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE test_batch_attendance a
       SET status=$1,
           updated_by=$2,
           updated_by_name=$3,
           edited_by=$2,
           edited_by_name=$3,
           edited_at=CURRENT_TIMESTAMP
       WHERE a.id=$4
         AND EXISTS (
           SELECT 1
           FROM test_batch_registrations tr
           WHERE UPPER(TRIM(tr.roll_no)) = UPPER(TRIM(a.roll_no))
             AND tr.writing_date = a.attendance_date
             AND tr.status='Registered'
         )
       RETURNING a.*`,
      [status,req.recordAuditActor.id,req.recordAuditActor.name,Number(req.params.id)]
    );

    if (result.rows.length===0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error:'Eligible Test Batch attendance record not found' });
    }

    const attendance = result.rows[0];
    if (status === 'Absent') {
      const registeredTests = await client.query(
        `SELECT DISTINCT t.test_code,t.subject_name,t.total_marks
         FROM test_batch_registrations r
         JOIN test_batch_tests t
           ON UPPER(TRIM(t.test_code))=UPPER(TRIM(r.test_code))
         WHERE UPPER(TRIM(r.roll_no))=UPPER(TRIM($1))
           AND r.writing_date=$2::date
           AND r.status='Registered'`,
        [attendance.roll_no,attendance.attendance_date]
      );

      for (const test of registeredTests.rows) {
        await client.query(
          `INSERT INTO test_batch_marks
            (roll_no,test_code,subject_name,total_marks,marks_obtained,comments,created_at,updated_at,entered_by,entered_by_name,entered_at,updated_by,updated_by_name)
           VALUES($1,$2,$3,$4,'A',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$5,$6,CURRENT_TIMESTAMP,$5,$6)
           ON CONFLICT(roll_no,test_code,subject_name) DO UPDATE SET
             total_marks=EXCLUDED.total_marks,
             marks_obtained='A',
             updated_by=$5,
             updated_by_name=$6,
             updated_at=CURRENT_TIMESTAMP`,
          [attendance.roll_no,test.test_code,test.subject_name,Number(test.total_marks),req.recordAuditActor.id,req.recordAuditActor.name]
        );
      }
    }

    await client.query('COMMIT');
    res.json({
      message: status === 'Absent'
        ? 'Test Batch attendance updated and marks automatically recorded as A'
        : 'Test Batch attendance updated successfully',
      attendance
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /test-batch/attendance/:id error:', err);
    res.status(err.code ? 500 : 400).json({ error:err.message || 'Failed to update Test Batch attendance' });
  } finally {
    client.release();
  }
});

app.get('/test-batch/attendance-report', requireTestBatchAttendanceMarksAccess, async (req,res) => {
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
          a.marked_by, a.marked_by_name,
          a.marked_at,
          a.edited_by, a.edited_by_name,
          a.edited_at
        FROM test_batch_attendance a
        JOIN test_batch_students s
          ON s.roll_no=a.roll_no
        JOIN test_series ts
          ON ts.id=s.test_series_id
        ${where}
        AND EXISTS (
          SELECT 1
          FROM test_batch_registrations tr
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

app.get('/test-batch/dashboard', requireTestBatchAttendanceMarksAccess, async (req,res) => {
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
    await ensureRecordAuditSchema();
    const roll=String(req.params.roll_no).toUpperCase().trim();
    if(!/^IAT[0-9]{3,}$/.test(roll)) return res.status(400).json({error:'Invalid Test Batch roll number'});

    const studentResult=await pool.query(
      'SELECT s.roll_no,s.name,s.class,s.board,s.mode_of_education,s.phone,s.email,s.school_name,s.subjects,' +
      's.date_of_birth,s.academic_year_from,s.academic_year_to,s.parent_name,s.secondary_contact,s.reference,' +
      's.test_series_id,ts.name AS test_series_name FROM test_batch_students s ' +
      'JOIN test_series ts ON ts.id=s.test_series_id WHERE s.roll_no=$1',
      [roll]
    );

    if(studentResult.rows.length===0) return res.status(404).json({error:'Test Batch student not found'});

    const marksResult=await pool.query(
      'SELECT m.id,m.test_code,m.subject_name,m.total_marks,m.marks_obtained,m.comments,m.created_at,m.entered_by,m.entered_by_name,m.entered_at,m.updated_by,m.updated_by_name,m.updated_at,t.portion ' +
      'FROM test_batch_marks m ' +
      'LEFT JOIN test_batch_tests t ON UPPER(TRIM(t.test_code))=UPPER(TRIM(m.test_code)) ' +
      'WHERE m.roll_no=$1 ORDER BY m.created_at DESC,m.id DESC',
      [roll]
    );

    const attendanceResult=await pool.query(
      'SELECT a.id,a.attendance_date,a.status,a.marked_by,a.marked_by_name,a.marked_at,a.edited_by,a.edited_by_name,a.edited_at, ' +
      'COALESCE((' +
      '  SELECT tr.test_code FROM test_batch_registrations tr ' +
      '  WHERE UPPER(TRIM(tr.roll_no))=UPPER(TRIM(a.roll_no)) ' +
      '    AND tr.writing_date=a.attendance_date ' +
      '  ORDER BY tr.registered_at DESC NULLS LAST,tr.test_code ASC LIMIT 1' +
      '),(' +
      '  SELECT t.test_code FROM test_batch_tests t ' +
      '  WHERE t.writing_date=a.attendance_date ' +
      '  ORDER BY t.test_code ASC LIMIT 1' +
      ')) AS test_code, ' +
      'COALESCE((' +
      '  SELECT t.subject_name FROM test_batch_registrations tr ' +
      '  JOIN test_batch_tests t ON UPPER(TRIM(t.test_code))=UPPER(TRIM(tr.test_code)) ' +
      '  WHERE UPPER(TRIM(tr.roll_no))=UPPER(TRIM(a.roll_no)) ' +
      '    AND tr.writing_date=a.attendance_date ' +
      '  ORDER BY tr.registered_at DESC NULLS LAST,tr.test_code ASC LIMIT 1' +
      '),(' +
      '  SELECT t.subject_name FROM test_batch_tests t ' +
      '  WHERE t.writing_date=a.attendance_date ' +
      '  ORDER BY t.test_code ASC LIMIT 1' +
      ')) AS subject_name ' +
      'FROM test_batch_attendance a ' +
      'WHERE UPPER(TRIM(a.roll_no))=UPPER(TRIM($1)) ' +
      'AND EXISTS (' +
      '  SELECT 1 FROM test_batch_registrations tr ' +
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
   TEST BATCH MOBILE STUDENT MARKS / ATTENDANCE
   These endpoints are read-only student endpoints used by
   the Flutter Test Batch dashboard.
========================================================= */
app.get('/test-batch/marks/:rollNo', async (req,res) => {
  try {
    await ensureRecordAuditSchema();
    const roll = String(req.params.rollNo || '').toUpperCase().trim();
    if (!/^IAT[0-9]{3,}$/.test(roll)) {
      return res.status(400).json({ error:'Invalid Test Batch roll number' });
    }

    const student = await pool.query(
      'SELECT roll_no FROM test_batch_students WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1))',
      [roll]
    );
    if (student.rows.length === 0) {
      return res.status(404).json({ error:'Test Batch student not found' });
    }

    const result = await pool.query(
      'SELECT m.id,m.test_code,m.subject_name,m.total_marks,m.marks_obtained,m.comments,m.created_at,m.entered_by,m.entered_by_name,m.entered_at,m.updated_by,m.updated_by_name,m.updated_at,t.portion ' +
      'FROM test_batch_marks m ' +
      'LEFT JOIN test_batch_tests t ON UPPER(TRIM(t.test_code))=UPPER(TRIM(m.test_code)) ' +
      'WHERE UPPER(TRIM(m.roll_no))=UPPER(TRIM($1)) ' +
      'ORDER BY m.created_at DESC,m.id DESC',
      [roll]
    );

    return res.json(result.rows.map(marksComputedFields));
  } catch (err) {
    console.error('GET /test-batch/marks/:rollNo error:',err);
    return res.status(500).json({ error:'Failed to load Test Batch marks' });
  }
});

app.get('/test-batch/attendance/:rollNo', async (req,res) => {
  try {
    await ensureRecordAuditSchema();
    const roll = String(req.params.rollNo || '').toUpperCase().trim();
    if (!/^IAT[0-9]{3,}$/.test(roll)) {
      return res.status(400).json({ error:'Invalid Test Batch roll number' });
    }

    const student = await pool.query(
      'SELECT roll_no FROM test_batch_students WHERE UPPER(TRIM(roll_no))=UPPER(TRIM($1))',
      [roll]
    );
    if (student.rows.length === 0) {
      return res.status(404).json({ error:'Test Batch student not found' });
    }

    const result = await pool.query(
      'SELECT a.id, ' +
      '       a.attendance_date, ' +
      '       a.status, ' +
      '       a.marked_by, a.marked_by_name, a.marked_at, a.edited_by, a.edited_by_name, a.edited_at, ' +
      '       COALESCE((' +
      '         SELECT tr.test_code FROM test_batch_registrations tr ' +
      '         WHERE UPPER(TRIM(tr.roll_no))=UPPER(TRIM(a.roll_no)) ' +
      '           AND tr.writing_date=a.attendance_date ' +
      '         ORDER BY tr.registered_at DESC NULLS LAST,tr.test_code ASC LIMIT 1' +
      '       ),(' +
      '         SELECT t.test_code FROM test_batch_tests t ' +
      '         WHERE t.writing_date=a.attendance_date ' +
      '         ORDER BY t.test_code ASC LIMIT 1' +
      '       )) AS test_code, ' +
      '       COALESCE((' +
      '         SELECT t.subject_name FROM test_batch_registrations tr ' +
      '         JOIN test_batch_tests t ON UPPER(TRIM(t.test_code))=UPPER(TRIM(tr.test_code)) ' +
      '         WHERE UPPER(TRIM(tr.roll_no))=UPPER(TRIM(a.roll_no)) ' +
      '           AND tr.writing_date=a.attendance_date ' +
      '         ORDER BY tr.registered_at DESC NULLS LAST,tr.test_code ASC LIMIT 1' +
      '       ),(' +
      '         SELECT t.subject_name FROM test_batch_tests t ' +
      '         WHERE t.writing_date=a.attendance_date ' +
      '         ORDER BY t.test_code ASC LIMIT 1' +
      '       )) AS subject_name ' +
      'FROM test_batch_attendance a ' +
      'WHERE UPPER(TRIM(a.roll_no))=UPPER(TRIM($1)) ' +
      'AND EXISTS (' +
      '  SELECT 1 FROM test_batch_registrations tr ' +
      '  WHERE UPPER(TRIM(tr.roll_no))=UPPER(TRIM(a.roll_no)) ' +
      '    AND tr.writing_date=a.attendance_date' +
      ') ' +
      'ORDER BY a.attendance_date DESC,a.id DESC LIMIT 100',
      [roll]
    );

    const total = result.rows.length;
    const present = result.rows.filter((row) => row.status === 'Present').length;

    return res.json({
      attendance: result.rows,
      attendancePercentage: total ? (present / total) * 100 : 0
    });
  } catch (err) {
    console.error('GET /test-batch/attendance/:rollNo error:',err);
    return res.status(500).json({ error:'Failed to load Test Batch attendance' });
  }
});


app.get('/record-audit-history', requireRecordAuditActor, async (req,res) => {
  try {
    const recordType = String(req.query.recordType || '').trim();
    const allowed = new Set(['marks','attendance','test_batch_marks','test_batch_attendance']);
    if (!allowed.has(recordType)) return res.status(400).json({ error:'Valid recordType is required' });
    const rollNo = String(req.query.rollNo || '').trim().toUpperCase();
    if (!rollNo) return res.status(400).json({ error:'rollNo is required' });
    const values = [recordType,rollNo];
    let where = "WHERE record_type=$1 AND UPPER(TRIM(record_key->>'roll_no'))=$2";
    if (req.query.testCode) {
      values.push(String(req.query.testCode).trim().toUpperCase());
      where += " AND UPPER(TRIM(record_key->>'test_code'))=$" + values.length;
    }
    if (req.query.attendanceDate) {
      values.push(String(req.query.attendanceDate).trim());
      where += " AND record_key->>'attendance_date'=$" + values.length;
    }
    if (req.query.subjectId) {
      values.push(String(req.query.subjectId).trim());
      where += " AND record_key->>'subject_id'=$" + values.length;
    }
    const result = await pool.query(
      'SELECT id,record_type,record_key,action,old_value,new_value,actor_id,actor_name,changed_at ' +
      'FROM record_audit_history ' + where +
      ' ORDER BY changed_at DESC,id DESC LIMIT 100',
      values
    );
    res.json({ history:result.rows });
  } catch (err) {
    console.error('GET /record-audit-history error:',err);
    res.status(500).json({ error:'Failed to load record audit history' });
  }
});

/* =========================================================
   STUDENT DEVICE TOKEN ROUTES
========================================================= */

app.post('/device-token', async (req, res) => {
  const { roll_no, token, platform = 'android' } = req.body || {};
  const rollNo = String(roll_no || '').toUpperCase().trim();
  const deviceToken = String(token || '').trim();
  const devicePlatform = String(platform || 'android').trim();

  if (!rollNo || !deviceToken) {
    return res.status(400).json({ error: 'roll_no and token are required' });
  }

  try {
    const student = await pool.query(
      `SELECT roll_no FROM students WHERE UPPER(TRIM(roll_no)) = $1
       UNION ALL
       SELECT roll_no FROM test_batch_students WHERE UPPER(TRIM(roll_no)) = $1
       LIMIT 1`,
      [rollNo]
    );

    if (student.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Idempotency ledger: one overdue alert per task for each admin.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.faculty_task_overdue_notifications (
      task_id INTEGER NOT NULL REFERENCES public.faculty_tasks(id) ON DELETE CASCADE,
      admin_id VARCHAR(30) NOT NULL,
      notified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, admin_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_faculty_tasks_overdue_pending
      ON public.faculty_tasks (due_date, id)
      WHERE is_completed = FALSE AND due_date IS NOT NULL
  `);

  await ensureStudentDeviceTokensTable();

    await pool.query(
      `INSERT INTO student_device_tokens
        (student_id, device_token, platform, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (device_token)
       DO UPDATE SET
         student_id = EXCLUDED.student_id,
         platform = EXCLUDED.platform,
         updated_at = CURRENT_TIMESTAMP`,
      [rollNo, deviceToken, devicePlatform]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('POST /device-token error:', error);
    return res.status(500).json({ error: 'Failed to register student notification device' });
  }
});

app.delete('/device-token', async (req, res) => {
  const { roll_no, token } = req.body || {};
  const rollNo = String(roll_no || '').toUpperCase().trim();
  const deviceToken = String(token || '').trim();

  if (!rollNo || !deviceToken) {
    return res.status(400).json({ error: 'roll_no and token are required' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM student_device_tokens WHERE UPPER(TRIM(student_id)) = $1 AND device_token = $2',
      [rollNo, deviceToken]
    );

    return res.json({ success: true, removed: result.rowCount || 0 });
  } catch (error) {
    console.error('DELETE /device-token error:', error);
    return res.status(500).json({ error: 'Failed to remove student notification device' });
  }
});


/* =========================================================
	SERVER START
	========================================================= */
const PORT = process.env.PORT || 5050;

let testBatchPushWorker;

async function ensureStudentDeviceTokensTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_device_tokens (
      id BIGSERIAL PRIMARY KEY,
      student_id VARCHAR(100) NOT NULL,
      device_token TEXT NOT NULL UNIQUE,
      platform VARCHAR(20) NOT NULL DEFAULT 'android',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_student_device_tokens_student_id
    ON student_device_tokens (UPPER(TRIM(student_id)))
  `);
}

registerRecordEditRoutes(app, pool);
registerTestBatchEditRequestRoutes(app, pool);

async function startServer() {
  await pool.query(`
    ALTER TABLE public.faculty_tasks
      ADD COLUMN IF NOT EXISTS test_code TEXT
  `);
  // Preserve previously assigned test codes, which the old form stored
  // in subject_name, while normalizing the new subject field.
  await pool.query(`
    UPDATE public.faculty_tasks
    SET test_code = CASE
          WHEN NULLIF(TRIM(test_code), '') IS NULL
           AND NULLIF(TRIM(subject_name), '') IS NOT NULL
           AND LOWER(TRIM(subject_name)) NOT IN ('maths', 'physics', 'other')
          THEN TRIM(subject_name)
          ELSE test_code
        END,
        subject_name = CASE
          WHEN UPPER(TRIM(COALESCE(subject_name, ''))) ~ '^[SCI](7|8|9|10|11|12)M'
            THEN 'Maths'
          WHEN UPPER(TRIM(COALESCE(subject_name, ''))) ~ '^[SCI](7|8|9|10|11|12)P'
            THEN 'Physics'
          WHEN LOWER(TRIM(COALESCE(subject_name, ''))) IN ('maths', 'physics', 'other')
            THEN CASE LOWER(TRIM(subject_name))
              WHEN 'maths' THEN 'Maths'
              WHEN 'physics' THEN 'Physics'
              ELSE 'Other'
            END
          WHEN NULLIF(TRIM(subject_name), '') IS NOT NULL
            THEN 'Other'
          ELSE subject_name
        END
    WHERE NULLIF(TRIM(subject_name), '') IS NOT NULL
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.enquiry_admission_drafts (
      enquiry_id BIGINT PRIMARY KEY,
      draft_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Keep public enquiry submissions compatible with databases created before
  // the latest enquiry form fields were introduced.
  await pool.query(`
    ALTER TABLE public.enquiries
      ADD COLUMN IF NOT EXISTS admission_token TEXT,
      ADD COLUMN IF NOT EXISTS admission_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS batch VARCHAR(30) DEFAULT 'Regular Batch',
      ADD COLUMN IF NOT EXISTS test_writing_day VARCHAR(10),
      ADD COLUMN IF NOT EXISTS date_of_birth DATE,
      ADD COLUMN IF NOT EXISTS academic_year_from VARCHAR(4),
      ADD COLUMN IF NOT EXISTS academic_year_to VARCHAR(4),
      ADD COLUMN IF NOT EXISTS parent_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS secondary_contact VARCHAR(20),
      ADD COLUMN IF NOT EXISTS area VARCHAR(150),
      ADD COLUMN IF NOT EXISTS mode_of_education VARCHAR(50),
      ADD COLUMN IF NOT EXISTS reference VARCHAR(150)
  `);
  await pool.query(`
    ALTER TABLE public.students
      ADD COLUMN IF NOT EXISTS test_writing_day VARCHAR(10)
  `);
  await pool.query(`
    ALTER TABLE public.test_batch_students
      ADD COLUMN IF NOT EXISTS date_of_birth DATE,
      ADD COLUMN IF NOT EXISTS academic_year_from VARCHAR(4),
      ADD COLUMN IF NOT EXISTS academic_year_to VARCHAR(4),
      ADD COLUMN IF NOT EXISTS parent_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS secondary_contact VARCHAR(20),
      ADD COLUMN IF NOT EXISTS reference VARCHAR(150)
  `);
  // Keep faculty notification archive endpoints compatible with existing databases.
  // The archived_at column is required by the inbox, archive, restore and 30-day cleanup routes.
  await pool.query(`
    ALTER TABLE public.faculty_notifications
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_faculty_notifications_active
      ON public.faculty_notifications (faculty_id, created_at DESC)
      WHERE archived_at IS NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_faculty_notifications_archived
      ON public.faculty_notifications (faculty_id, archived_at DESC)
      WHERE archived_at IS NOT NULL
  `);

  await ensureStudentDeviceTokensTable();

  const facultyNotificationService = require('./faculty-notification-service');

  testBatchPushWorker = createTestBatchPushWorker({
    pool,
    sendToStudent,
    sendToFaculty: facultyNotificationService.sendToFaculty,
    createFacultyNotification: facultyNotificationService.createFacultyNotification,
  });
  testBatchPushWorker.start();

  // Run at startup, then once per minute. The daily-task advisory lock and
  // overdue notification ledger make repeated scheduler/API runs safe.
  runFacultyTaskNotificationJobs();
  setInterval(runFacultyTaskNotificationJobs, 60 * 1000).unref();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});

process.on('SIGTERM', () => {
  if (testBatchPushWorker) testBatchPushWorker.stop();
});
