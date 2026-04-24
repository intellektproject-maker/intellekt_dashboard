'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function FeePage() {
	const searchParams = useSearchParams();
	const roll = searchParams.get('roll');

	const [ fee, setFee ] = useState(null);

	useEffect(
		() => {
			if (!roll) return;

			async function fetchFee() {
				const res = await fetch(`http://192.168.1.20:5050/fees/${roll}`);
				const data = await res.json();
				setFee(data);
			}

			fetchFee();
		},
		[ roll ]
	);

	const formatDate = (dateString) => {
		const d = new Date(dateString);

		const day = String(d.getDate()).padStart(2, '0');
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const year = d.getFullYear();

		return `${day}-${month}-${year}`;
	};

	if (!fee) return <p className="p-6 md:p-10 text-gray-700">Loading...</p>;

	return (
		<div className="p-6 md:p-10">
			<h2 className="text-2xl md:text-3xl font-bold text-blue-700 mb-6">Fee Details</h2>

			<div className="bg-white shadow-md rounded-xl p-6">
				<div className="overflow-x-auto">
					<table className="min-w-full border-collapse">
						<thead className="bg-blue-700 text-white">
							<tr>
								<th className="p-3 text-left whitespace-nowrap">Total Fee</th>
								<th className="p-3 text-left whitespace-nowrap">Fee Paid</th>
								<th className="p-3 text-left whitespace-nowrap">Next Due</th>
							</tr>
						</thead>

						<tbody>
							{fee.map((f, i) => (
								<tr key={i} className="border-b text-gray-700">
									<td className="p-3 whitespace-nowrap">{f.total_fee}</td>
									<td className="p-3 whitespace-nowrap">{f.fee_paid}</td>
									<td className="p-3 whitespace-nowrap">{formatDate(f.next_due)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
