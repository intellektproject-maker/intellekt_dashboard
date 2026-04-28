'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MarksPage() {
	const searchParams = useSearchParams();
	const roll = searchParams.get('roll');

	const [ marks, setMarks ] = useState(null);

	useEffect(
		() => {
			if (!roll) return;

			async function fetchMarks() {
				try {
					const res = await fetch(`http://192.168.1.26:5050/marks/${roll}`);
					const data = await res.json();
					setMarks(data);
				} catch (err) {
					console.error(err);
				}
			}

			fetchMarks();
		},
		[ roll ]
	);

	if (!marks) {
		return <p className="p-4">Loading...</p>;
	}

	const mathsMarks = marks.filter(
		(m) =>
			(m.subject && String(m.subject).toUpperCase() === 'MATHS') ||
			(m.test_code && String(m.test_code).toUpperCase().includes('M'))
	);

	const physicsMarks = marks.filter(
		(m) =>
			(m.subject && String(m.subject).toUpperCase() === 'PHYSICS') ||
			(m.test_code && String(m.test_code).toUpperCase().includes('P'))
	);

	const renderTable = (title, data) => (
		<div className="mb-8">
			<h3 className="text-xl md:text-2xl font-bold text-blue-800 mb-4">{title}</h3>

			<div className="bg-white shadow rounded-xl p-4 md:p-6">
				<div className="overflow-x-auto">
					<table className="min-w-full border text-sm md:text-base">
						<thead className="bg-gray-200">
							<tr>
								<th className="p-2 border whitespace-nowrap">Test Code</th>
								<th className="p-2 border whitespace-nowrap">Marks Obtained</th>
								<th className="p-2 border whitespace-nowrap">Comments</th>
							</tr>
						</thead>

						<tbody>
							{data.length > 0 ? (
								data.map((m, index) => (
									<tr key={index}>
										<td className="p-2 border whitespace-nowrap">{m.test_code}</td>
										<td className="p-2 border whitespace-nowrap">{m.marks_obtained}</td>
										<td className="p-2 border break-words">{m.comments}</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan="3" className="p-4 border text-center text-gray-500">
										No records found
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);

	return (
		<div className="p-4 md:p-10">
			<h2 className="text-2xl md:text-3xl font-bold text-blue-800 mb-6">Marks</h2>

			{renderTable('Mathematics', mathsMarks)}
			{renderTable('Physics', physicsMarks)}
		</div>
	);
}
