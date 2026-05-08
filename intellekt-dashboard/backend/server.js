const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();

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
			const result = await pool.query(`SELECT faculty_id, password FROM faculty WHERE faculty_id = $1`, [
				idUpper
			]);

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
				id: idUpper
			});
		}

		if (prefix === 'IA') {
			const result = await pool.query(`SELECT roll_no, password FROM students WHERE roll_no = $1`, [ idUpper ]);

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
				id: idUpper
			});
		}

		return res.status(400).json({ error: 'Invalid id format' });
	} catch (err) {
		console.error('POST /login error:', err);
		res.status(500).json({ error: 'Server error' });
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
			[rollNo]
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
        t.total_marks
      FROM marks m
      JOIN tests t ON m.test_code = t.test_code
      WHERE m.roll_no = $1
      ORDER BY m.test_code
      `,
			[ roll ]
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
		const studentRes = await pool.query(
			`
			SELECT 
				TRIM(class) AS class,
				TRIM(board) AS board
			FROM students
			WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))
			`,
			[roll]
		);

		if (studentRes.rows.length === 0) {
			return res.status(404).json({ error: 'Student not found' });
		}

		const { class: className, board } = studentRes.rows[0];

		const testsRes = await pool.query(
			`
      SELECT 
        t.test_code,
        t.subject_id,
        t.test_date,
        t.total_marks,
        t.portion,
        t.duration_minutes,
        t.registration_end_date,
        t.writing_allowed_till,
        t.test_slot_link,
        r.slot_start,
        r.slot_end,
        r.writing_date
      FROM tests t
      LEFT JOIN test_registrations r
        ON r.test_code = t.test_code
        AND r.roll_no = $1
      WHERE t.class = $2
        AND t.board = $3
      ORDER BY t.test_date ASC
      `,
			[ roll, className, board ]
		);

		const formatted = testsRes.rows.map((row) => ({
			test_code: row.test_code,
			subject_id: row.subject_id,
			subject_name: row.subject_name,
			test_date: row.test_date,
			total_marks: row.total_marks,
			portion: row.portion,
			duration_minutes: row.duration_minutes,
			registration_end_date: row.registration_end_date,
			writing_allowed_till: row.writing_allowed_till,
			test_slot_link: row.test_slot_link,
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

		if (student.class !== test.class || student.board !== test.board) {
			return res.status(403).json({
				error: "This test does not belong to the student's class/board"
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

		if (student.class !== test.class || student.board !== test.board) {
			await client.query('ROLLBACK');
			return res.status(403).json({
				error: "This test does not belong to the student's class/board"
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

/* =========================================================
   FEES
========================================================= */
app.get('/fees/:roll', async (req, res) => {
	const { roll } = req.params;

	try {
		const result = await pool.query(
			`
      SELECT total_fee, fee_paid, next_due
      FROM fees
      WHERE roll_no = $1
      `,
			[ roll ]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /fees/:roll error:', err);
		res.status(500).json({ error: 'Database error' });
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

	try {
		for (const record of records) {
			if (record.marks === undefined || record.marks === null || record.marks === '') {
				continue;
			}

			const testResult = await pool.query(`SELECT total_marks FROM tests WHERE test_code = $1`, [
				record.test_code
			]);

			if (testResult.rows.length === 0) {
				return res.status(400).json({
					error: `Invalid test code: ${record.test_code}`
				});
			}

			const totalMarks = Number(testResult.rows[0].total_marks);
			const obtainedMarks = Number(record.marks);

			if (obtainedMarks > totalMarks) {
				return res.status(400).json({
					error: `Marks for ${record.roll_no} cannot be greater than total marks (${totalMarks}) for test ${record.test_code}`
				});
			}

			await pool.query(
				`
        INSERT INTO marks (roll_no, test_code, marks_obtained, comments)
        VALUES ($1, $2, $3, $4)
        `,
				[ record.roll_no, record.test_code, obtainedMarks, record.comments || null ]
			);
		}

		res.json({ message: 'Marks saved successfully' });
	} catch (err) {
		console.error('POST /marks error:', err);

		if (err.code === '23505') {
			return res.status(400).json({
				error: 'Marks already exist for one or more students in this test'
			});
		}

		res.status(500).json({ error: 'Marks save failed' });
	}
});

app.get('/marks', async (req, res) => {
	const { name, className, testCode } = req.query;

	try {
		let query = `
      SELECT 
        s.roll_no,
        s.name,
        s.class,
        s.board,
        m.test_code,
        m.marks_obtained,
        m.comments,
        t.total_marks
      FROM marks m
      JOIN students s ON m.roll_no = s.roll_no
      JOIN tests t ON m.test_code = t.test_code
      WHERE 1=1
    `;

		const values = [];

		if (name) {
			values.push(`%${name}%`);
			query += ` AND s.name ILIKE $${values.length}`;
		}

		if (className) {
			const lastDash = String(className).lastIndexOf('-');

			if (lastDash !== -1) {
				const board = String(className).slice(0, lastDash).trim();
				const classOnly = String(className).slice(lastDash + 1).trim();

				values.push(classOnly);
				query += ` AND TRIM(s.class) = TRIM($${values.length})`;

				values.push(board);
				query += ` AND TRIM(s.board) = TRIM($${values.length})`;
			} else {
				values.push(className);
				query += ` AND TRIM(s.class) = TRIM($${values.length})`;
			}
		}

		if (testCode) {
			values.push(testCode);
			query += ` AND UPPER(TRIM(m.test_code)) = UPPER(TRIM($${values.length}))`;
		}

		query += ` ORDER BY s.roll_no ASC`;

		const result = await pool.query(query, values);
		res.json(result.rows);
	} catch (err) {
		console.error('GET /marks error:', err);
		res.status(500).json({ error: 'Failed to fetch marks' });
	}
});
app.put('/marks/:roll_no/:test_code', async (req, res) => {
	const { roll_no, test_code } = req.params;
	const { marks, comments } = req.body;

	try {
		const testResult = await pool.query(`SELECT total_marks FROM tests WHERE test_code = $1`, [ test_code ]);

		if (testResult.rows.length === 0) {
			return res.status(404).json({ error: 'Test not found' });
		}

		const totalMarks = Number(testResult.rows[0].total_marks);
		const obtainedMarks = Number(marks);

		if (obtainedMarks > totalMarks) {
			return res.status(400).json({
				error: `Marks cannot be greater than total marks (${totalMarks})`
			});
		}

		await pool.query(
			`
      UPDATE marks
      SET marks_obtained = $1,
          comments = COALESCE($2, comments)
      WHERE roll_no = $3 AND test_code = $4
      `,
			[ obtainedMarks, comments || null, roll_no, test_code ]
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
		const testResult = await pool.query(`SELECT total_marks FROM tests WHERE test_code = $1`, [ test_code ]);

		if (testResult.rows.length === 0) {
			return res.status(404).json({ error: 'Test not found' });
		}

		const totalMarks = Number(testResult.rows[0].total_marks);
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
        AND marks.test_code = $3
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

			const values = [classOnly, from, to];

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
			[rollNo]
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

	if (!subject) {
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

		await client.query('COMMIT');

		res.json({
			message: overwrite
				? 'Attendance overwritten successfully'
				: 'Attendance saved successfully'
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
			[testCode]
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
			created_by,
			class_name,
			board,
			duration_minutes,
			registration_end_date,
			writing_allowed_till
		} = req.body;

		console.log('POST /post-test BODY:', req.body);

		if (
			!test_code ||
			!subject_id ||
			!test_date ||
			!total_marks ||
			!created_by ||
			!class_name ||
			!board
		) {
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
			[cleanTestCode]
		);

		if (existingTest.rows.length > 0) {
			await client.query('ROLLBACK');
			return res.status(400).json({
				error: 'Test code already exists'
			});
		}

		const existingLink = await client.query(
			`
			SELECT test_slot_link
			FROM tests
			WHERE test_date = $1
			  AND test_slot_link IS NOT NULL
			LIMIT 1
			`,
			[test_date]
		);

		let link;

		if (existingLink.rows.length > 0) {
			link = existingLink.rows[0].test_slot_link;
		} else {
			link = `https://responsible-wonder-production.up.railway.app/register-test?date=${test_date}`;
		}

		const insertResult = await client.query(
			`
			INSERT INTO tests (
				test_code,
				subject_id,
				test_date,
				total_marks,
				portion,
				created_by,
				class,
				board,
				test_slot_link,
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
				created_by,
				cleanClassName,
				cleanBoard,
				link,
				duration_minutes || null,
				registration_end_date || null,
				writing_allowed_till || null
			]
		);

		await client.query('COMMIT');

		res.json({
			message: 'Test posted successfully',
			test: insertResult.rows[0],
			link
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
        f.subject_id,
        s.subject_name,
        f.phone,
        f.email,
        f.password
      FROM faculty f
      LEFT JOIN subjects s ON f.subject_id = s.subject_id
      ORDER BY f.faculty_id ASC
    `);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /faculty error:', err);
		res.status(500).json({ error: 'Failed to fetch faculty list' });
	}
});

app.get('/subjects', async (req, res) => {
	try {
		const result = await pool.query(`
      SELECT subject_id, subject_name
      FROM subjects
      ORDER BY subject_id ASC
    `);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /subjects error:', err);
		res.status(500).json({ error: 'Failed to fetch subjects' });
	}
});

app.post('/faculty', async (req, res) => {
	const { faculty_id, name, subject_id, phone, email, password } = req.body;

	if (!faculty_id || !name || !subject_id || !phone || !email || !password) {
		return res.status(400).json({ error: 'All fields are required' });
	}

	try {
		const existingFaculty = await pool.query(`SELECT faculty_id FROM faculty WHERE faculty_id = $1`, [
			faculty_id
		]);

		if (existingFaculty.rows.length > 0) {
			return res.status(400).json({ error: 'Faculty ID already exists' });
		}

		const subjectCheck = await pool.query(`SELECT subject_id FROM subjects WHERE subject_id = $1`, [ subject_id ]);

		if (subjectCheck.rows.length === 0) {
			return res.status(400).json({ error: 'Selected subject does not exist' });
		}

		const result = await pool.query(
			`
      INSERT INTO faculty (
        faculty_id,
        name,
        subject_id,
        phone,
        email,
        password
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
			[ faculty_id, name, subject_id, phone, email, password ]
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
	const { name, subject_id, phone, email, password } = req.body;

	if (!name || !subject_id || !phone || !email) {
		return res.status(400).json({
			error: 'Name, subject, phone and email are required'
		});
	}

	try {
		const existingFaculty = await pool.query(`SELECT * FROM faculty WHERE faculty_id = $1`, [ faculty_id ]);

		if (existingFaculty.rows.length === 0) {
			return res.status(404).json({ error: 'Faculty not found' });
		}

		const subjectCheck = await pool.query(`SELECT subject_id FROM subjects WHERE subject_id = $1`, [ subject_id ]);

		if (subjectCheck.rows.length === 0) {
			return res.status(400).json({ error: 'Selected subject does not exist' });
		}

		let result;

		if (password && password.trim() !== '') {
			result = await pool.query(
				`
        UPDATE faculty
        SET name = $1,
            subject_id = $2,
            phone = $3,
            email = $4,
            password = $5
        WHERE faculty_id = $6
        RETURNING *
        `,
				[ name, subject_id, phone, email, password, faculty_id ]
			);
		} else {
			result = await pool.query(
				`
        UPDATE faculty
        SET name = $1,
            subject_id = $2,
            phone = $3,
            email = $4
        WHERE faculty_id = $5
        RETURNING *
        `,
				[ name, subject_id, phone, email, faculty_id ]
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

	try {
		const existingFaculty = await pool.query(`SELECT * FROM faculty WHERE faculty_id = $1`, [ faculty_id ]);

		if (existingFaculty.rows.length === 0) {
			return res.status(404).json({ error: 'Faculty not found' });
		}

		const linkedTests = await pool.query(`SELECT test_code FROM tests WHERE created_by = $1 LIMIT 1`, [
			faculty_id
		]);

		if (linkedTests.rows.length > 0) {
			return res.status(400).json({
				error: 'Cannot delete this faculty because test records are linked to this faculty ID'
			});
		}

		const linkedAttendance = await pool.query(`SELECT roll_no FROM attendance WHERE updated_by = $1 LIMIT 1`, [
			faculty_id
		]);

		if (linkedAttendance.rows.length > 0) {
			return res.status(400).json({
				error: 'Cannot delete this faculty because attendance records are linked to this faculty ID'
			});
		}

		await pool.query(`DELETE FROM faculty WHERE faculty_id = $1`, [ faculty_id ]);

		res.json({ message: 'Faculty deleted successfully' });
	} catch (err) {
		console.error('DELETE /faculty/:faculty_id error:', err);
		res.status(500).json({ error: 'Failed to delete faculty' });
	}
});

/* =========================================================
   STUDENT MANAGEMENT
========================================================= */
async function generateNextStudentRollNo(client) {
	const result = await client.query(`
		SELECT roll_no
		FROM students
		WHERE UPPER(TRIM(roll_no)) LIKE 'IA%'
		ORDER BY CAST(REGEXP_REPLACE(roll_no, '[^0-9]', '', 'g') AS INTEGER) DESC
		LIMIT 1
	`);

	if (result.rows.length === 0) {
		return 'IA001';
	}

	const lastRollNo = String(result.rows[0].roll_no || '').toUpperCase().trim();
	const lastNumber = Number(lastRollNo.replace('IA', ''));

	const nextNumber = Number.isNaN(lastNumber) ? 1 : lastNumber + 1;

	return `IA${String(nextNumber).padStart(3, '0')}`;
}
app.get('/students', async (req, res) => {
	const { search = '', class: className = '', board = '' } = req.query;

	try {
		let query = `
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
        COALESCE(f.total_fee, 0) AS total_fee
      FROM students s
      LEFT JOIN fees f ON s.roll_no = f.roll_no
      WHERE 1=1
    `;

		const values = [];
		let index = 1;

		if (search.trim()) {
			query += `
        AND (
          s.roll_no ILIKE $${index}
          OR s.name ILIKE $${index}
          OR s.phone ILIKE $${index}
          OR s.email ILIKE $${index}
          OR s.school_name ILIKE $${index}
          OR s.password ILIKE $${index}
        )
      `;
			values.push(`%${search.trim()}%`);
			index++;
		}

		if (className.trim()) {
			query += ` AND s.class = $${index}`;
			values.push(className.trim());
			index++;
		}

		if (board.trim()) {
			query += ` AND s.board = $${index}`;
			values.push(board.trim());
			index++;
		}

		query += ` ORDER BY s.roll_no ASC`;

		const result = await pool.query(query, values);
		res.json(result.rows);
	} catch (err) {
		console.error('GET /students error:', err);
		res.status(500).json({
			error: 'Failed to fetch students',
			details: err.message
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
			[studentClass]
		);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /students-by-class/:class error:', err);
		res.status(500).json({ error: 'Database error' });
	}
});

/*
  Smart route:
  - /students/IA001 gives one student's full details
  - /students/CBSE-11 gives student list for class
*/
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
				[upperValue]
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
				[upperValue]
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
			[value]
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
		const finalPassword = password && String(password).trim() !== ''
			? String(password).trim()
			: newRoll;

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
			const subjectCheck = await client.query(
				`SELECT subject_id FROM subjects WHERE subject_id = $1`,
				[subjectId]
			);

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
				[newRoll, Number(subjectId)]
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

		if (!roll_no || !name || !className || !board || !mode_of_education || !phone || !email || !school_name || !password) {
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
			[oldRollNo]
		);

		if (existingStudent.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Student not found' });
		}

		const newRollNo = String(roll_no).trim().toUpperCase();

		if (oldRollNo !== newRollNo) {
			const duplicateCheck = await client.query(
				`SELECT roll_no FROM students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`,
				[newRollNo]
			);

			if (duplicateCheck.rows.length > 0) {
				await client.query('ROLLBACK');
				return res.status(400).json({ error: 'New roll number already exists' });
			}

			await client.query(`UPDATE student_subjects SET roll_no = $1 WHERE roll_no = $2`, [newRollNo, oldRollNo]);
			await client.query(`UPDATE fees SET roll_no = $1 WHERE roll_no = $2`, [newRollNo, oldRollNo]);
			await client.query(`UPDATE attendance SET roll_no = $1 WHERE roll_no = $2`, [newRollNo, oldRollNo]);
			await client.query(`UPDATE marks SET roll_no = $1 WHERE roll_no = $2`, [newRollNo, oldRollNo]);
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

		await client.query(`DELETE FROM student_subjects WHERE roll_no = $1`, [newRollNo]);

		for (const subjectId of subject_ids) {
			const subjectCheck = await client.query(
				`SELECT subject_id FROM subjects WHERE subject_id = $1`,
				[subjectId]
			);

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
				[newRollNo, Number(subjectId)]
			);
		}

		const feeCheck = await client.query(`SELECT roll_no FROM fees WHERE roll_no = $1`, [newRollNo]);

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
			[roll_no]
		);

		if (existingStudent.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Student not found' });
		}

		await client.query(`DELETE FROM student_subjects WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [roll_no]);
		await client.query(`DELETE FROM fees WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [roll_no]);
		await client.query(`DELETE FROM attendance WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [roll_no]);
		await client.query(`DELETE FROM marks WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [roll_no]);
		await client.query(`DELETE FROM students WHERE UPPER(TRIM(roll_no)) = UPPER(TRIM($1))`, [roll_no]);

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
			[template.id, today]
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
					OR parent_daily_task_id IS NOT NULL
			  )
			ORDER BY created_at DESC
			`,
			[facultyId]
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
		if (!['IG001', 'IG002'].includes(loginFacultyId)) {
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
		if (!['IG001', 'IG002'].includes(loginFacultyId)) {
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
			[today]
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

		if (!['IG001', 'IG002'].includes(loginFacultyId)) {
			return res.status(403).json({
				error: 'Only IG001 and IG002 can assign tasks'
			});
		}

		const finalTaskType = task_type === 'Daily' ? 'Daily' : 'Weekly';
		const today = new Date().toISOString().slice(0, 10);

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

			return res.json({
				message: 'Daily task assigned successfully',
				task: todayTaskResult.rows[0]
			});
		}

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

		res.json({
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
				[faculty_id, faculty_name, id]
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
				[is_completed, id]
			);
		} else {
			return res.status(400).json({
				error: 'No valid update data provided'
			});
		}

		if (result.rowCount === 0) {
			return res.status(404).json({ error: 'Task not found' });
		}

		res.json(result.rows[0]);
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
		if (!['IG001', 'IG002'].includes(loginFacultyId)) {
			return res.status(403).json({
				error: 'Only IG001 and IG002 can delete faculty tasks'
			});
		}

		const result = await pool.query(
			`
			DELETE FROM faculty_tasks
			WHERE id = $1
			   OR parent_daily_task_id = $1
			RETURNING *
			`,
			[id]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: 'Task not found' });
		}

		res.json({
			message: 'Task deleted successfully',
			deletedTask: result.rows[0]
		});
	} catch (err) {
		console.error('DELETE /faculty-tasks/:id error:', err);
		res.status(500).json({
			error: 'Failed to delete task',
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

		const result = await pool.query(
			`
      DELETE FROM faculty_tasks
      WHERE id = $1
      RETURNING *
      `,
			[ id ]
		);

		if (result.rowCount === 0) {
			return res.status(404).json({ error: 'Task not found' });
		}

		res.json({
			message: 'Task deleted successfully',
			deletedTask: result.rows[0]
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
			[status || 'Pending', comment || null, reason || null, id]
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
			[id]
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
		let query = `
      SELECT
        tr.id,
        tr.roll_no,
        tr.student_name,
        tr.class,
        tr.board,
        tr.test_code,
        tr.test_date,
        TO_CHAR(tr.writing_date, 'DD-MM-YYYY') AS writing_date,
        tr.slot_start,
        tr.slot_end,
        tr.duration_minutes,
        s.subject_name,
        TO_CHAR(tr.slot_start, 'HH24:MI') || ' - ' || TO_CHAR(tr.slot_end, 'HH24:MI') AS slot_raw
      FROM test_registrations tr
      LEFT JOIN subjects s
        ON tr.subject_id = s.subject_id
      WHERE 1=1
    `;

		const values = [];
		let index = 1;

		if (className) {
			query += ` AND tr.class = $${index}`;
			values.push(className);
			index++;
		}

		if (board) {
			query += ` AND tr.board = $${index}`;
			values.push(board);
			index++;
		}

		if (date) {
			query += ` AND tr.writing_date = $${index}`;
			values.push(date);
			index++;
		}

		query += `
      ORDER BY
        tr.writing_date ASC NULLS LAST,
        tr.test_date ASC,
        tr.class ASC,
        tr.roll_no ASC
    `;

		const result = await pool.query(query, values);

		const rows = result.rows.map((row) => {
			let slotLabel = row.slot_raw || '';

			if (row.slot_raw && row.slot_raw !== ' - ') {
				const [ startRaw, endRaw ] = row.slot_raw.split(' - ');

				if (startRaw && endRaw) {
					const startMinutes = timeStringToMinutes(startRaw);
					const endMinutes = timeStringToMinutes(endRaw);

					slotLabel = `${formatTimeFromMinutes(startMinutes)} - ${formatTimeFromMinutes(endMinutes)}`;
				}
			}

			return {
				...row,
				slot_label: slotLabel
			};
		});

		res.json(rows);
	} catch (err) {
		console.error('GET /registered-students error:', err);
		res.status(500).json({ error: 'Failed to fetch registered students' });
	}
});

/* =========================================================
   SERVER START
========================================================= */
const PORT = process.env.PORT || 5050;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});