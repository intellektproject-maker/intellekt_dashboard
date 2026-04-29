'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/backend-api';

export default function AttendancePage() {
	const searchParams = useSearchParams();
	const roll = searchParams.get('roll');

	const [ attendance, setAttendance ] = useState([]);
	const [ selectedMonth, setSelectedMonth ] = useState(() => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	});

	const [ presentSubjectFilter, setPresentSubjectFilter ] = useState('');
	const [ absentSubjectFilter, setAbsentSubjectFilter ] = useState('');

	useEffect(
		() => {
			if (!roll) return;

			async function load() {
				try {
					const res = await fetch(`${API_BASE}/attendance/${roll}`);

					if (!res.ok) {
						setAttendance([]);
						return;
					}

					const rows = await res.json();

					const prefix = selectedMonth + '-';
					const filtered = Array.isArray(rows)
						? rows.filter((r) => String(r.attendance_date || '').startsWith(prefix))
						: [];

					setAttendance(filtered);
				} catch (err) {
					console.error('Load attendance error:', err);
					setAttendance([]);
				}
			}

			load();
		},
		[ roll, selectedMonth ]
	);

	const formatDate = (dateString) => {
		const d = new Date(dateString);
		const day = String(d.getDate()).padStart(2, '0');
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const year = d.getFullYear();
		return `${day}-${month}-${year}`;
	};

	const [ selYear, selMonth ] = selectedMonth.split('-').map(Number);
	const daysInMonth = selYear && selMonth ? new Date(selYear, selMonth, 0).getDate() : 30;
	const total = attendance.length;
	const notEntered = Math.max(0, daysInMonth - total);

	const subjectMap = {
		1: 'Maths',
		2: 'Physics'
	};

	const presentDates = attendance
		.filter((a) => String(a.status || '').toLowerCase() === 'present')
		.sort((a, b) => new Date(b.attendance_date) - new Date(a.attendance_date));

	const absentDates = attendance
		.filter((a) => String(a.status || '').toLowerCase() === 'absent')
		.sort((a, b) => new Date(b.attendance_date) - new Date(a.attendance_date));

	const filteredPresentDates = presentDates.filter((a) => {
		if (!presentSubjectFilter) return true;
		return (subjectMap[a.subject_id] || '').toLowerCase() === presentSubjectFilter.toLowerCase();
	});

	const filteredAbsentDates = absentDates.filter((a) => {
		if (!absentSubjectFilter) return true;
		return (subjectMap[a.subject_id] || '').toLowerCase() === absentSubjectFilter.toLowerCase();
	});

	const present = presentDates.length;
	const absent = absentDates.length;

	const chartData = {
		labels: [ 'Present', 'Absent', 'Not Entered' ],
		datasets: [
			{
				data: [ present, absent, notEntered ],
				backgroundColor: [ '#22c55e', '#ef4444', '#9ca3af' ],
				borderWidth: 1
			}
		]
	};

	return (
		<div className="p-6 md:p-10">
			<h2 className="text-2xl md:text-3xl font-bold text-blue-700 mb-6">Attendance</h2>

			{/* Month Filter */}
			<div className="flex items-center gap-4 mb-6 flex-wrap">
				<label className="text-sm font-medium">Month</label>
				<input
					type="month"
					value={selectedMonth}
					onChange={(e) => setSelectedMonth(e.target.value)}
					className="border rounded-lg px-3 py-2"
				/>
			</div>

			{/* Summary */}
			<div className="bg-white rounded-xl shadow-md p-6 mb-8">
				<h3 className="text-lg md:text-xl font-semibold text-blue-700 mb-4">Attendance Summary</h3>

				<div className="flex flex-col md:flex-row justify-between items-start gap-6">
					<div className="space-y-3 w-full text-gray-700">
						<div className="flex items-center gap-2">
							<div className="w-4 h-4 bg-green-500 rounded-sm" />
							<span className="font-medium">Present :</span> {present}
						</div>

						<div className="flex items-center gap-2">
							<div className="w-4 h-4 bg-red-500 rounded-sm" />
							<span className="font-medium">Absent :</span> {absent}
						</div>

						<div className="flex items-center gap-2">
							<div className="w-4 h-4 bg-gray-400 rounded-sm" />
							<span className="font-medium">Not Entered :</span> {notEntered}
						</div>
					</div>

					<div className="w-36 h-36 md:w-40 md:h-40">
						<Pie data={chartData} />
					</div>
				</div>

				<p className="mt-6 text-gray-600">
					Last Attendance Updated Date :{' '}
					{attendance.length > 0 ? formatDate(attendance[attendance.length - 1].attendance_date) : 'No Data'}
				</p>
			</div>

			{/* PRESENTS */}
			<div className="bg-white rounded-xl shadow-md p-6 mb-6">
				<div className="flex justify-between items-center mb-4">
					<h3 className="text-lg font-semibold text-green-700">Presents</h3>

					<select
						value={presentSubjectFilter}
						onChange={(e) => setPresentSubjectFilter(e.target.value)}
						className="border rounded-lg px-3 py-2"
					>
						<option value="">All</option>
						<option value="Maths">Maths</option>
						<option value="Physics">Physics</option>
					</select>
				</div>

				<div className="h-[200px] overflow-y-auto border rounded-lg p-3">
					{filteredPresentDates.map((a, i) => (
						<div key={i} className="flex justify-between py-1">
							<span>{formatDate(a.attendance_date)}</span>
							<span>{subjectMap[a.subject_id]}</span>
						</div>
					))}
				</div>
			</div>

			{/* ABSENTS */}
			<div className="bg-white rounded-xl shadow-md p-6">
				<div className="flex justify-between items-center mb-4">
					<h3 className="text-lg font-semibold text-red-700">Absents</h3>

					<select
						value={absentSubjectFilter}
						onChange={(e) => setAbsentSubjectFilter(e.target.value)}
						className="border rounded-lg px-3 py-2"
					>
						<option value="">All</option>
						<option value="Maths">Maths</option>
						<option value="Physics">Physics</option>
					</select>
				</div>

				<div className="h-[200px] overflow-y-auto border rounded-lg p-3">
					{filteredAbsentDates.map((a, i) => (
						<div key={i} className="flex justify-between py-1">
							<span>{formatDate(a.attendance_date)}</span>
							<span>{subjectMap[a.subject_id]}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
