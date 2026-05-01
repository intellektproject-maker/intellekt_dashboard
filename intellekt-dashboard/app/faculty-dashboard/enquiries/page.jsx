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
			SELECT DISTINCT class, board
			FROM students
			WHERE class IS NOT NULL
			  AND board IS NOT NULL
			ORDER BY board ASC, class ASC
		`);

		res.json(result.rows);
	} catch (err) {
		console.error('GET /classes error:', err);
		res.status(500).json({ error: 'Failed to fetch classes' });
	}
});

app.get('/attendance', async (req, res) => {
	const { mode, class: classBoard, subject, date, from, to } = req.query;
	const { board, classOnly } = splitClassBoard(classBoard);

	try {
		if (mode === 'report') {
			if (!classBoard) {
				return res.status(400).json({
					error: 'class is required for report mode'
				});
			}

			let query = `
				SELECT
					a.roll_no,
					s.name,
					s.class,
					s.board,
					a.subject_id,
					TO_CHAR(a.attendance_date, 'YYYY-MM-DD') AS attendance_date,
					a.status,
					a.updated_by
				FROM attendance a
				JOIN students s ON s.roll_no = a.roll_no
				WHERE 1 = 1
			`;

			const values = [];
			let index = 1;

			if (board && classOnly) {
				query += ` AND UPPER(s.board) = UPPER($${index})`;
				values.push(board);
				index++;

				query += ` AND s.class::text = $${index}`;
				values.push(classOnly);
				index++;
			} else if (classOnly) {
				query += ` AND s.class::text = $${index}`;
				values.push(classOnly);
				index++;
			}

			if (subject) {
				query += ` AND a.subject_id = $${index}`;
				values.push(subject);
				index++;
			}

			if (from) {
				query += ` AND a.attendance_date >= $${index}`;
				values.push(from);
				index++;
			}

			if (to) {
				query += ` AND a.attendance_date <= $${index}`;
				values.push(to);
				index++;
			}

			query += ` ORDER BY a.attendance_date DESC, a.roll_no ASC`;

			const result = await pool.query(query, values);
			return res.json(result.rows);
		}

		if (!classBoard || !subject || !date) {
			return res.status(400).json({
				error: 'class, subject and date are required'
			});
		}

		let query = `
			SELECT
				s.roll_no,
				s.name,
				a.status
			FROM students s
			LEFT JOIN attendance a
				ON s.roll_no = a.roll_no
				AND a.subject_id = $1
				AND a.attendance_date = $2
			WHERE 1 = 1
		`;

		const values = [subject, date];
		let index = 3;

		if (board && classOnly) {
			query += ` AND UPPER(s.board) = UPPER($${index})`;
			values.push(board);
			index++;

			query += ` AND s.class::text = $${index}`;
			values.push(classOnly);
			index++;
		} else if (classOnly) {
			query += ` AND s.class::text = $${index}`;
			values.push(classOnly);
			index++;
		}

		query += ` ORDER BY s.roll_no ASC`;

		const result = await pool.query(query, values);
		res.json(result.rows);
	} catch (err) {
		console.error('GET /attendance error:', err);
		res.status(500).json({ error: 'Failed to fetch attendance' });
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
				WHERE roll_no = $1
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
						    updated_by = $2
						WHERE roll_no = $3
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
						(roll_no, subject_id, attendance_date, status, updated_by)
					VALUES ($1, $2, $3, $4, $5)
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
		res.status(500).json({ error: 'Failed to save attendance' });
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
			await client.query(
				`
				UPDATE attendance
				SET status = $1,
				    updated_by = $2
				WHERE roll_no = $3
				  AND subject_id = $4
				  AND attendance_date = $5
				`,
				[record.status, facultyId, record.roll_no, subject, selectedDate]
			);
		}

		await client.query('COMMIT');
		res.json({ message: 'Attendance updated successfully' });
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('PUT /attendance error:', err);
		res.status(500).json({ error: 'Failed to update attendance' });
	} finally {
		client.release();
	}
});