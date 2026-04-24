'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5050';

const subjectMap = {
	1: 'MATHS',
	2: 'PHYSICS'
};

const reverseSubjectMap = {
	MATHS: 1,
	PHYSICS: 2
};

export default function AdminAttendancePage() {
	const searchParams = useSearchParams();
	const adminId = searchParams.get('id') || 'IP001';

	const [ classOptions, setClassOptions ] = useState([]);
	const [ records, setRecords ] = useState([]);
	const [ loadingClasses, setLoadingClasses ] = useState(true);
	const [ loadingRecords, setLoadingRecords ] = useState(false);
	const [ savingRow, setSavingRow ] = useState('');

	const [ filters, setFilters ] = useState({
		classBoard: '',
		subject: '',
		date: '',
		status: '',
		search: ''
	});

	const [ editStatusMap, setEditStatusMap ] = useState({});

	const [archivedMode, setArchivedMode] = useState(false);
	const [archivedOptions, setArchivedOptions] = useState([]);
	const [selectedArchive, setSelectedArchive] = useState(null);

	useEffect(() => {
		async function loadClasses() {
			try {
				setLoadingClasses(true);
				const res = await fetch(`${API_BASE}/classes`);
				const data = await res.json();

				if (Array.isArray(data)) {
					setClassOptions(data);
				} else {
					setClassOptions([]);
				}
			} catch (err) {
				console.error('Error loading classes:', err);
				setClassOptions([]);
			} finally {
				setLoadingClasses(false);
			}
		}

		loadClasses();
	}, []);

	async function loadAttendance() {
		try {
			setLoadingRecords(true);

			const params = new URLSearchParams();

			if (filters.classBoard) {
				const [ board, className ] = filters.classBoard.split('-');
				params.append('board', board || '');
				params.append('class', className || '');
			}

			if (filters.subject) {
				params.append('subject', reverseSubjectMap[filters.subject]);
			}

			if (filters.date) {
				params.append('date', filters.date);
			}

			if (filters.status) {
				params.append('status', filters.status);
			}

			if (filters.search.trim()) {
				params.append('search', filters.search.trim());
			}

			const res = await fetch(`${API_BASE}/attendance/admin?${params.toString()}`);
			const data = await res.json();

			if (!res.ok) {
				alert(data.error || 'Failed to load attendance');
				setRecords([]);
				return;
			}

			const safeData = Array.isArray(data) ? data : [];
			setRecords(safeData);

			const nextEditMap = {};
			safeData.forEach((row) => {
				nextEditMap[`${row.roll_no}-${row.subject_id}-${row.attendance_date}`] = row.status;
			});
			setEditStatusMap(nextEditMap);
		} catch (err) {
			console.error('Error loading attendance:', err);
			alert('Failed to load attendance');
			setRecords([]);
		} finally {
			setLoadingRecords(false);
		}
	}

	async function loadArchivesList() {
		try {
			const res = await fetch(`${API_BASE}/attendance/archives`);
			if (!res.ok) return setArchivedOptions([]);
			const data = await res.json();
			setArchivedOptions(data);
		} catch (err) {
			console.error('Failed to load archives list', err);
			setArchivedOptions([]);
		}
	}

	async function loadArchivedMonth(year, month) {
		try {
			if (!year || !month) return;
			const res = await fetch(`${API_BASE}/attendance/archive?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				alert(data.error || 'Failed to load archived attendance');
				return;
			}
			const rows = await res.json();
			// convert rows into same shape as live records
			const safe = Array.isArray(rows) ? rows.map((r) => ({
				roll_no: r.roll_no,
				name: r.student_name || r.name || '',
				class: r.class || r.class_name || '',
				board: r.board || '',
				subject_id: r.subject_id || '',
				attendance_date: r.attendance_date,
				status: r.status,
				updated_by: r.updated_by || r.updated_by || ''
			})) : [];
			setRecords(safe);
			setEditStatusMap({});
		} catch (err) {
			console.error('Load archive error:', err);
			alert('Failed to load archived attendance');
		}
	}

	function handleFilterChange(field, value) {
		setFilters((prev) => ({
			...prev,
			[field]: value
		}));
	}

	function resetFilters() {
		setFilters({
			classBoard: '',
			subject: '',
			date: '',
			status: '',
			search: ''
		});
		setRecords([]);
		setEditStatusMap({});
	}

	function formatDate(dateString) {
		if (!dateString) return '-';
		const d = new Date(dateString);
		if (Number.isNaN(d.getTime())) return dateString;

		const day = String(d.getDate()).padStart(2, '0');
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const year = d.getFullYear();

		return `${day}-${month}-${year}`;
	}

	async function updateAttendance(row) {
		if (archivedMode) {
			alert('Cannot update attendance while viewing an archived month');
			return;
		}
		const key = `${row.roll_no}-${row.subject_id}-${row.attendance_date}`;
		const newStatus = editStatusMap[key];

		if (!newStatus || newStatus === row.status) {
			alert('No changes to update');
			return;
		}

		const ok = window.confirm(
			`Change attendance for ${row.roll_no} on ${formatDate(
				row.attendance_date
			)} from ${row.status} to ${newStatus}?`
		);

		if (!ok) return;

		try {
			setSavingRow(key);

			const res = await fetch(`${API_BASE}/attendance/admin-update`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					roll_no: row.roll_no,
					subject_id: row.subject_id,
					attendance_date: row.attendance_date,
					status: newStatus,
					updated_by: adminId
				})
			});

			const data = await res.json();

			if (!res.ok) {
				alert(data.error || 'Failed to update attendance');
				return;
			}

			alert('Attendance updated successfully');

			setRecords((prev) =>
				prev.map(
					(item) =>
						item.roll_no === row.roll_no &&
						String(item.subject_id) === String(row.subject_id) &&
						item.attendance_date === row.attendance_date
							? { ...item, status: newStatus, updated_by: adminId }
							: item
				)
			);
		} catch (err) {
			console.error('Update error:', err);
			alert('Failed to update attendance');
		} finally {
			setSavingRow('');
		}
	}

	function downloadCSV() {
		if (!records.length) {
			alert('No attendance records to download');
			return;
		}

		const headers = [ 'Roll No', 'Student Name', 'Class', 'Board', 'Subject', 'Date', 'Status', 'Updated By' ];

		const rows = records.map((row) => [
			row.roll_no || '',
			row.name || '',
			row.class || '',
			row.board || '',
			subjectMap[row.subject_id] || row.subject_id || '',
			formatDate(row.attendance_date),
			row.status || '',
			row.updated_by || ''
		]);

		const csvContent = [
			headers.join(','),
			...rows.map((r) => r.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
		].join('\n');

		const blob = new Blob([ csvContent ], { type: 'text/csv;charset=utf-8;' });
		const url = window.URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = `attendance_report_${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();

		window.URL.revokeObjectURL(url);
	}

	const summary = useMemo(
		() => {
			const total = records.length;
			const present = records.filter((r) => r.status === 'present').length;
			const absent = records.filter((r) => r.status === 'absent').length;

			return { total, present, absent };
		},
		[ records ]
	);

	return (
		<div className="min-h-screen bg-gray-100 flex">
			<Sidebar role="admin" id={adminId} />

			<div className="flex-1 flex flex-col">
				<Navbar title="Manage Attendance" />

				<main className="p-4 md:p-6">
					<div className="bg-white rounded-2xl shadow-md p-4 md:p-6">
						<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
							<div>
								<h1 className="text-2xl font-bold text-blue-900">Attendance Management</h1>
								<p className="text-sm text-gray-600 mt-1">
									View, filter, edit, and download attendance records
								</p>
							</div>

							<div className="flex flex-wrap gap-2">
								<button
									onClick={loadAttendance}
									className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg font-medium"
								>
									Search
								</button>
								<button
									onClick={resetFilters}
									className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium"
								>
									Reset
								</button>
								<button
									onClick={downloadCSV}
									className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium"
								>
									Download Report
								</button>

								{/* Archived mode toggle */}
								<div className="flex items-center gap-2">
									<label className="text-sm">View Archived</label>
									<input
										type="checkbox"
										checked={archivedMode}
										onChange={async (e) => {
											setArchivedMode(e.target.checked);
											if (e.target.checked) await loadArchivesList();
											else setSelectedArchive(null);
										}}
										className="w-4 h-4"
									/>
								</div>

								{/* Archived month selector */}
								{archivedMode && (
									<>
										<select
											value={selectedArchive ? `${selectedArchive.year}-${selectedArchive.month}` : ''}
											onChange={(e) => {
											const val = e.target.value;
											if (!val) return setSelectedArchive(null);
											const [yy, mm] = val.split('-');
											const opt = archivedOptions.find((o) => o.year === yy && o.month === mm);
											setSelectedArchive(opt || null);
										}}
										className="border rounded-lg px-3 py-2"
										>
											<option value="">Select month</option>
											{archivedOptions.map((o) => (
												<option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
													{o.display}
												</option>
											))}
										</select>
										<button
											onClick={() => {
											if (!selectedArchive) return alert('Select an archived month');
											loadArchivedMonth(selectedArchive.year, selectedArchive.month);
											// ensure download uses currently loaded records
										}}
										className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg ml-2"
										>
											Load Archive
										</button>
									</>
								)}
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1">Class</label>
								<select
									value={filters.classBoard}
									onChange={(e) => handleFilterChange('classBoard', e.target.value)}
									className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
								>
									<option value="">{loadingClasses ? 'Loading...' : 'All Classes'}</option>
									{classOptions.map((item, idx) => {
										const value = `${item.board}-${item.class}`;
										return (
											<option key={idx} value={value}>
												{item.board} - {item.class}
											</option>
										);
									})}
								</select>
							</div>

							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1">Subject</label>
								<select
									value={filters.subject}
									onChange={(e) => handleFilterChange('subject', e.target.value)}
									className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
								>
									<option value="">All Subjects</option>
									<option value="MATHS">MATHS</option>
									<option value="PHYSICS">PHYSICS</option>
								</select>
							</div>

							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
								<input
									type="date"
									value={filters.date}
									onChange={(e) => handleFilterChange('date', e.target.value)}
									className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
								/>
							</div>

							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
								<select
									value={filters.status}
									onChange={(e) => handleFilterChange('status', e.target.value)}
									className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
								>
									<option value="">All Status</option>
									<option value="present">Only Present</option>
									<option value="absent">Only Absent</option>
								</select>
							</div>

							<div>
								<label className="block text-sm font-semibold text-gray-700 mb-1">Search</label>
								<input
									type="text"
									placeholder="Name or Roll No"
									value={filters.search}
									onChange={(e) => handleFilterChange('search', e.target.value)}
									className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
							<div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
								<p className="text-sm text-gray-600">Total Records</p>
								<h3 className="text-2xl font-bold text-blue-900">{summary.total}</h3>
							</div>

							<div className="bg-green-50 rounded-xl p-4 border border-green-100">
								<p className="text-sm text-gray-600">Present</p>
								<h3 className="text-2xl font-bold text-green-700">{summary.present}</h3>
							</div>

							<div className="bg-red-50 rounded-xl p-4 border border-red-100">
								<p className="text-sm text-gray-600">Absent</p>
								<h3 className="text-2xl font-bold text-red-700">{summary.absent}</h3>
							</div>
						</div>

						<div className="overflow-x-auto">
							{loadingRecords ? (
								<div className="py-10 text-center text-gray-600">Loading attendance...</div>
							) : records.length === 0 ? (
								<div className="py-10 text-center text-gray-500">No attendance records found</div>
							) : (
								<table className="w-full min-w-[1100px] border-collapse">
									<thead>
										<tr className="bg-blue-900 text-white text-left">
											<th className="p-3">Roll No</th>
											<th className="p-3">Name</th>
											<th className="p-3">Class</th>
											<th className="p-3">Board</th>
											<th className="p-3">Subject</th>
											<th className="p-3">Date</th>
											<th className="p-3">Current Status</th>
											{!archivedMode && <th className="p-3">Edit Status</th>}
											<th className="p-3">Updated By</th>
											{!archivedMode && <th className="p-3">Action</th>}
										</tr>
									</thead>

									<tbody>
										{records.map((row, index) => {
											const key = `${row.roll_no}-${row.subject_id}-${row.attendance_date}`;
											const isSaving = savingRow === key;

											return (
												<tr key={key} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
													<td className="p-3 border-b">{row.roll_no}</td>
													<td className="p-3 border-b">{row.name}</td>
													<td className="p-3 border-b">{row.class}</td>
													<td className="p-3 border-b">{row.board}</td>
													<td className="p-3 border-b">
														{subjectMap[row.subject_id] || row.subject_id}
													</td>
													<td className="p-3 border-b">{formatDate(row.attendance_date)}</td>
													<td className="p-3 border-b">
														<span
															className={`px-3 py-1 rounded-full text-xs font-semibold ${row.status ===
															'present'
																? 'bg-green-100 text-green-700'
																: 'bg-red-100 text-red-700'}`}
														>
															{row.status}
														</span>
													</td>
													{!archivedMode ? (
														<td className="p-3 border-b">
															<select
																value={editStatusMap[key] || row.status}
																onChange={(e) =>
																	setEditStatusMap((prev) => ({
																		...prev,
																		[key]: e.target.value
																	}))}
																className="border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-300"
															>
																<option value="present">present</option>
																<option value="absent">absent</option>
															</select>
														</td>
													) : (
														<td className="p-3 border-b">{row.status}</td>
													)}
													<td className="p-3 border-b">{row.updated_by || '-'}</td>
													{!archivedMode && (
														<td className="p-3 border-b">
															<button
																onClick={() => updateAttendance(row)}
																disabled={isSaving}
																className={`px-4 py-2 rounded-lg text-white font-medium ${isSaving
																	? 'bg-gray-400 cursor-not-allowed'
																	: 'bg-blue-700 hover:bg-blue-800'}`}
															>
																{isSaving ? 'Saving...' : 'Update'}
															</button>
														</td>
													)}
												</tr>
											);
										})}
									</tbody>
								</table>
							)}
						</div>
					</div>
				</main>
			</div>
		</div>
	);
}
