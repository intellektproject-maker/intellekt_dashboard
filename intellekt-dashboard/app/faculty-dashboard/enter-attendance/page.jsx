'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function EnterAttendancePage() {
	const searchParams = useSearchParams();
	const facultyId = searchParams.get('id');

	const [classBoard, setClassBoard] = useState('');
	const [subject, setSubject] = useState('');
	const [selectedDate, setSelectedDate] = useState('');
	const [students, setStudents] = useState([]);
	const [attendance, setAttendance] = useState({});
	const [loading, setLoading] = useState(false);
	const [showPopup, setShowPopup] = useState(false);
	const [absentees, setAbsentees] = useState([]);

	const subjectMap = {
		MATHS: 1,
		PHYSICS: 2
	};

	useEffect(() => {
		const today = new Date().toISOString().split('T')[0];
		setSelectedDate(today);
	}, []);

	async function loadStudents() {
		if (!classBoard || !subject || !selectedDate) {
			alert('Please select class, subject and date');
			return;
		}

		try {
			setLoading(true);

			const res = await fetch(
				`http://192.168.1.20:5050/attendance?class=${encodeURIComponent(classBoard)}&subject=${subjectMap[subject]}&date=${selectedDate}`
			);

			const data = await res.json();

			if (!res.ok) {
				alert(data.error || 'Failed to load students');
				return;
			}

			setStudents(data);

			const map = {};
			data.forEach((student) => {
				map[student.roll_no] = student.status || 'Present';
			});

			setAttendance(map);
		} catch (err) {
			console.error('Load students error:', err);
			alert('Failed to load students');
		} finally {
			setLoading(false);
		}
	}

	function handleAttendanceChange(rollNo, value) {
		setAttendance((prev) => ({
			...prev,
			[rollNo]: value
		}));
	}

	function handlePreview() {
		const absentList = students.filter((student) => attendance[student.roll_no] === 'Absent');
		setAbsentees(absentList);
		setShowPopup(true);
	}

	function resetForm() {
		setClassBoard('');
		setSubject('');
		setStudents([]);
		setAttendance({});
		setShowPopup(false);
		setAbsentees([]);
		const today = new Date().toISOString().split('T')[0];
		setSelectedDate(today);
	}

	async function submitAttendance(overwrite = false) {
		try {
			const records = students.map((student) => ({
				roll_no: student.roll_no,
				status: attendance[student.roll_no] || 'Present'
			}));

			const res = await fetch('http://192.168.1.20:5050/attendance', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					records,
					subject: subjectMap[subject],
					facultyId,
					date: selectedDate,
					overwrite
				})
			});

			const data = await res.json();

			if (!res.ok) {
				if (data.duplicateFound) {
					const confirmOverwrite = window.confirm('Attendance already exists. Overwrite?');
					if (confirmOverwrite) submitAttendance(true);
					return;
				}

				alert(data.error || 'Failed to save attendance');
				return;
			}

			alert('Attendance saved successfully');
			resetForm();
		} catch (err) {
			console.error('Submit error:', err);
			alert('Failed to submit attendance');
		}
	}

	return (
		<div className="p-6 md:p-10 min-h-[80vh] bg-gray-50">
			<h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-6">Enter Attendance</h1>

			<div className="bg-white shadow-md rounded-xl p-6 mb-6 border">
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
					<select
						value={classBoard}
						onChange={(e) => setClassBoard(e.target.value)}
						className="border rounded-lg px-4 py-3"
					>
						<option value="">Select Class</option>
						<option value="CBSE-12">CBSE-12</option>
						<option value="CBSE-10">CBSE-10</option>
						<option value="ISC-12">ISC-12</option>
						<option value="SB-12">SB-12</option>
						<option value="SB-10">SB-10</option>
						<option value="ICSE-10">ICSE-10</option>
					</select>

					<select
						value={subject}
						onChange={(e) => setSubject(e.target.value)}
						className="border rounded-lg px-4 py-3"
					>
						<option value="">Select Subject</option>
						<option value="MATHS">MATHS</option>
						<option value="PHYSICS">PHYSICS</option>
					</select>

					<input
						type="date"
						value={selectedDate}
						onChange={(e) => setSelectedDate(e.target.value)}
						className="border rounded-lg px-4 py-3"
					/>

					<button
						onClick={loadStudents}
						className="bg-blue-700 text-white rounded-lg px-4 py-3 hover:bg-blue-800"
					>
						Load Students
					</button>
				</div>
			</div>

			{loading && <p className="text-gray-600">Loading students...</p>}

			{!loading && students.length > 0 && (
				<div className="bg-white shadow-md rounded-xl p-6 border">
					<div className="overflow-x-auto">
						<table className="w-full border-collapse min-w-[700px]">
							<thead>
								<tr className="border-b text-gray-700">
									<th className="text-left py-3">Roll No</th>
									<th className="text-left py-3">Name</th>
									<th className="text-left py-3">Status</th>
								</tr>
							</thead>

							<tbody>
								{students.map((student) => (
									<tr key={student.roll_no} className="border-b">
										<td className="py-3">{student.roll_no}</td>
										<td className="py-3">{student.name}</td>
										<td className="py-3">
											<select
												value={attendance[student.roll_no] || 'Present'}
												onChange={(e) =>
													handleAttendanceChange(student.roll_no, e.target.value)}
												className="border rounded-lg px-3 py-2"
											>
												<option value="Present">Present</option>
												<option value="Absent">Absent</option>
											</select>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<button
						onClick={handlePreview}
						className="mt-6 bg-blue-700 text-white px-6 py-3 rounded-lg hover:bg-blue-800"
					>
						Preview & Submit
					</button>
				</div>
			)}

			{showPopup && (
				<div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
					<div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
						<h2 className="text-2xl font-bold text-blue-800 mb-4">Absentees Preview</h2>

						{absentees.length === 0 ? (
							<p className="text-gray-600 mb-4">No absentees. All students are present.</p>
						) : (
							<ul className="list-disc list-inside mb-4 text-gray-700">
								{absentees.map((student) => (
									<li key={student.roll_no}>
										{student.roll_no} - {student.name}
									</li>
								))}
							</ul>
						)}

						<div className="flex gap-3">
							<button onClick={() => setShowPopup(false)} className="px-5 py-2 rounded-lg border">
								Cancel
							</button>

							<button
								onClick={() => submitAttendance(false)}
								className="px-5 py-2 rounded-lg bg-blue-700 text-white hover:bg-blue-800"
							>
								Submit Attendance
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}