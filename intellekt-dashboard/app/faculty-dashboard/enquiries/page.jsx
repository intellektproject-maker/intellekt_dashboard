'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE = 'http://192.168.1.20:5050';

const CLASS_OPTIONS = [ '10', '11', '12' ];
const BOARD_OPTIONS = [ 'CBSE', 'ICSE', 'State Board' ];

function loadScript(src) {
	return new Promise((resolve, reject) => {
		if (document.querySelector(`script[src="${src}"]`)) {
			resolve();
			return;
		}
		const script = document.createElement('script');
		script.src = src;
		script.onload = resolve;
		script.onerror = reject;
		document.head.appendChild(script);
	});
}

async function generatePDF(filteredData) {
	await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
	await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

	const { jsPDF } = window.jspdf;
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

	const tableColumns = [
		{ header: 'Student Name', dataKey: 'student_name' },
		{ header: 'Class & Board', dataKey: 'class_board' },
		{ header: 'Mode', dataKey: 'mode_of_education' },
		{ header: 'Area', dataKey: 'area' },
		{ header: 'School Name', dataKey: 'school_name' },
		{ header: 'Subjects', dataKey: 'subjects' },
		{ header: 'Parent Name', dataKey: 'parent_name' },
		{ header: 'Mobile', dataKey: 'mobile_number' },
		{ header: 'Status', dataKey: 'status' },
		{ header: 'Reason', dataKey: 'comment' },
		{ header: 'Enquiry Date', dataKey: 'created_at' }
	];

	const tableRows = filteredData.map((item) => ({
		student_name: item.student_name || '-',
		class_board: item.class_board || '-',
		mode_of_education: item.mode_of_education || '-',
		area: item.area || '-',
		school_name: item.school_name || '-',
		subjects: item.subjects || '-',
		parent_name: item.parent_name || '-',
		mobile_number: item.mobile_number || '-',
		status: item.status || 'Pending',
		comment: item.comment || item.reason || '-',
		created_at: item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '-'
	}));

	doc.autoTable({
		columns: tableColumns,
		body: tableRows,
		startY: 10,
		margin: { left: 8, right: 8 },
		styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
		headStyles: { fillColor: [ 29, 78, 216 ], textColor: [ 255, 255, 255 ], fontStyle: 'bold' },
		alternateRowStyles: { fillColor: [ 245, 247, 255 ] }
	});

	doc.save('Enquiry_Table.pdf');
}

export default function EnquiriesPage() {
	const [ data, setData ] = useState([]);
	const [ loading, setLoading ] = useState(true);
	const [ pdfLoading, setPdfLoading ] = useState(false);

	const [ classFilter, setClassFilter ] = useState('');
	const [ boardFilter, setBoardFilter ] = useState('');
	const [ statusFilter, setStatusFilter ] = useState('');

	useEffect(() => {
		loadData();
	}, []);

	const loadData = async () => {
		try {
			const res = await fetch(`${API_BASE}/enquiries`, { cache: 'no-store' });
			const json = await res.json();
			setData(Array.isArray(json) ? json : []);
		} catch (err) {
			console.error('Fetch enquiries error:', err);
			setData([]);
		} finally {
			setLoading(false);
		}
	};

	const handleDelete = async (id) => {
		try {
			const confirmDelete = window.confirm('Are you sure you want to reject and delete this enquiry?');
			if (!confirmDelete) return;

			const res = await fetch(`${API_BASE}/enquiries/${id}`, { method: 'DELETE' });
			const result = await res.json();

			if (!res.ok) {
				alert(result.error || 'Failed to delete enquiry');
				return;
			}

			alert('Rejected enquiry deleted successfully');
			setData((prev) => prev.filter((item) => item.id !== id));
		} catch (err) {
			console.error('Delete error:', err);
			alert('Error deleting enquiry');
		}
	};

	const handleUpdate = async (id, status, comment) => {
		if (status === 'Rejected') {
			await handleDelete(id);
			return;
		}

		try {
			const payload = {
				status,
				comment: status === 'Pending' ? comment : '',
				reason: status === 'Pending' ? comment : ''
			};

			const res = await fetch(`${API_BASE}/enquiries/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await res.json();

			if (!res.ok) {
				alert(result.error || 'Failed to update enquiry');
				return;
			}

			alert('Saved successfully');
			await loadData();
		} catch (err) {
			console.error('Update error:', err);
			alert('Error updating enquiry');
		}
	};

	const filteredData = useMemo(
		() => {
			return data.filter((item) => {
				const itemClass = getClassValue(item.class_board);
				const itemBoard = getBoardValue(item.class_board);
				const itemStatus = (item.status || '').trim();

				return (
					(!classFilter || itemClass === classFilter) &&
					(!boardFilter || itemBoard === boardFilter) &&
					(!statusFilter || itemStatus === statusFilter)
				);
			});
		},
		[ data, classFilter, boardFilter, statusFilter ]
	);

	const clearFilters = () => {
		setClassFilter('');
		setBoardFilter('');
		setStatusFilter('');
	};

	const handleGeneratePDF = async () => {
		if (filteredData.length === 0) {
			alert('No data to export.');
			return;
		}
		try {
			setPdfLoading(true);
			await generatePDF(filteredData);
		} catch (error) {
			console.error('PDF generation error:', error);
			alert('Failed to generate PDF');
		} finally {
			setPdfLoading(false);
		}
	};

	if (loading) return <div className="p-6 md:p-10 text-gray-700">Loading...</div>;

	return (
		<div className="p-4 md:p-10">
			<div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<h2 className="text-2xl md:text-3xl font-bold text-blue-700">Enquiries</h2>
				<div className="hidden md:block">
					<button
						onClick={handleGeneratePDF}
						disabled={pdfLoading || filteredData.length === 0}
						className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 transition"
					>
						{pdfLoading ? 'Generating PDF...' : 'Export PDF'}
					</button>
				</div>
			</div>

			<div className="mb-6 rounded-xl bg-white p-4 shadow-md">
				<div className="flex flex-col gap-3 md:flex-row md:items-center">
					<select
						value={classFilter}
						onChange={(e) => setClassFilter(e.target.value)}
						className="rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-700"
					>
						<option value="">All Classes</option>
						{CLASS_OPTIONS.map((c) => (
							<option key={c} value={c}>
								Class {c}
							</option>
						))}
					</select>

					<select
						value={boardFilter}
						onChange={(e) => setBoardFilter(e.target.value)}
						className="rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-700"
					>
						<option value="">All Boards</option>
						{BOARD_OPTIONS.map((b) => (
							<option key={b} value={b}>
								{b}
							</option>
						))}
					</select>

					<select
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value)}
						className="rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-700"
					>
						<option value="">All Status</option>
						<option value="Admitted">Admitted</option>
						<option value="Rejected">Rejected</option>
						<option value="Pending">Pending</option>
					</select>

					<button
						onClick={clearFilters}
						className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
					>
						Clear
					</button>
				</div>
			</div>

			<div className="rounded-xl bg-white p-4 md:p-6 shadow-md">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[1100px] table-fixed border-collapse">
						<thead>
							<tr className="border-b border-gray-300">
								<th className="w-[16%] px-4 py-3 text-left text-base font-semibold text-blue-700">
									Student
								</th>
								<th className="w-[14%] px-4 py-3 text-left text-base font-semibold text-blue-700">
									Class
								</th>
								<th className="w-[10%] px-4 py-3 text-left text-base font-semibold text-blue-700">
									Mode
								</th>
								<th className="w-[14%] px-4 py-3 text-left text-base font-semibold text-blue-700">
									Mobile
								</th>
								<th className="w-[16%] px-4 py-3 text-left text-base font-semibold text-blue-700">
									Status
								</th>
								<th className="w-[18%] px-4 py-3 text-left text-base font-semibold text-blue-700">
									Pending Reason
								</th>
								<th className="w-[12%] px-4 py-3 text-left text-base font-semibold text-blue-700">
									Action
								</th>
							</tr>
						</thead>
						<tbody>
							{filteredData.length === 0 ? (
								<tr>
									<td colSpan="7" className="px-4 py-6 text-center text-gray-600">
										No enquiries found
									</td>
								</tr>
							) : (
								filteredData.map((item) => <Row key={item.id} item={item} onSave={handleUpdate} />)
							)}
						</tbody>
					</table>
				</div>
			</div>

			<div className="mt-6 md:hidden">
				<button
					onClick={handleGeneratePDF}
					disabled={pdfLoading || filteredData.length === 0}
					className="w-full rounded-lg bg-blue-700 py-3 text-sm font-semibold text-white shadow hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 transition"
				>
					{pdfLoading ? 'Generating PDF...' : `Export PDF (${filteredData.length})`}
				</button>
			</div>
		</div>
	);
}

function getBoardValue(classBoard) {
	if (!classBoard) return '';
	const value = classBoard.trim();
	const lastDash = value.lastIndexOf('-');
	if (lastDash === -1) return value.toUpperCase();
	return value.slice(0, lastDash).toUpperCase();
}

function getClassValue(classBoard) {
	if (!classBoard) return '';
	const value = classBoard.trim();
	const lastDash = value.lastIndexOf('-');
	if (lastDash === -1) return value.toUpperCase();
	return value.slice(lastDash + 1).toUpperCase();
}

function Row({ item, onSave }) {
	const [ status, setStatus ] = useState(item.status || 'Pending');
	const [ comment, setComment ] = useState(item.comment || item.reason || '');

	useEffect(
		() => {
			setStatus(item.status || 'Pending');
			setComment(item.comment || item.reason || '');
		},
		[ item ]
	);

	const handleSave = () => {
		if (status === 'Pending' && !comment.trim()) {
			alert('Please enter the reason for pending');
			return;
		}
		onSave(item.id, status, status === 'Pending' ? comment : '');
	};

	return (
		<tr className="border-b border-gray-300">
			<td className="px-4 py-3 text-left text-gray-800 align-top">{item.student_name || '-'}</td>
			<td className="px-4 py-3 text-left text-gray-800 align-top">{item.class_board || '-'}</td>
			<td className="px-4 py-3 text-left text-gray-800 align-top">
				<span
					className={`inline-block rounded-md px-3 py-1 text-xs font-semibold ${item.mode_of_education ===
					'Online'
						? 'bg-blue-100 text-blue-700'
						: item.mode_of_education === 'Offline'
							? 'bg-green-100 text-green-700'
							: 'bg-gray-100 text-gray-600'}`}
				>
					{item.mode_of_education || '-'}
				</span>
			</td>
			<td className="px-4 py-3 text-left text-gray-800 align-top">{item.mobile_number || '-'}</td>
			<td className="px-4 py-3 text-left align-top">
				<select
					value={status}
					onChange={(e) => {
						const v = e.target.value;
						setStatus(v);
						if (v !== 'Pending') setComment('');
					}}
					className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-800 outline-none focus:border-blue-700"
				>
					<option value="Pending">Pending</option>
					<option value="Admitted">Admitted</option>
					<option value="Rejected">Rejected</option>
				</select>
			</td>
			<td className="px-4 py-3 text-left align-top">
				{status === 'Pending' ? (
					<input
						type="text"
						value={comment}
						onChange={(e) => setComment(e.target.value)}
						placeholder="Enter reason for pending"
						className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-800 outline-none focus:border-blue-700"
					/>
				) : (
					<span className="text-gray-400">—</span>
				)}
			</td>
			<td className="px-4 py-3 text-left align-top">
				<button onClick={handleSave} className="rounded-md px-3 py-2 text-gray-900 hover:bg-gray-100">
					Save
				</button>
			</td>
		</tr>
	);
}
