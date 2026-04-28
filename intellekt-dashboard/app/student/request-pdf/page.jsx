'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_BASE = 'http://192.168.1.26:5050'; // change if needed

export default function RequestPdfPage() {
	const searchParams = useSearchParams();
	const roll = searchParams.get('roll');

	const [ student, setStudent ] = useState(null);
	const [ tests, setTests ] = useState([]);
	const [ selectedTest, setSelectedTest ] = useState('');
	const [ phone, setPhone ] = useState('');
	const [ loading, setLoading ] = useState(true);
	const [ submitting, setSubmitting ] = useState(false);
	const [ message, setMessage ] = useState('');
	const [ error, setError ] = useState('');

	useEffect(
		() => {
			if (!roll) return;

			async function fetchData() {
				try {
					setLoading(true);
					setError('');
					setMessage('');

					const res = await fetch(`${API_BASE}/student-answer-sheet-data/${roll}`, {
						cache: 'no-store'
					});

					const data = await res.json();

					if (!res.ok) {
						throw new Error(data.error || 'Failed to fetch data');
					}

					setStudent(data.student || null);
					setTests(Array.isArray(data.tests) ? data.tests : []);
				} catch (err) {
					console.error('Fetch error:', err);
					setError(err.message || 'Unable to load data');
				} finally {
					setLoading(false);
				}
			}

			fetchData();
		},
		[ roll ]
	);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setMessage('');

		if (!selectedTest) {
			setError('Please select a test code');
			return;
		}

		const cleanPhone = phone.replace(/\D/g, '');
		if (!/^\d{10}$/.test(cleanPhone)) {
			setError('Phone number must contain exactly 10 digits');
			return;
		}

		try {
			setSubmitting(true);

			const res = await fetch(`${API_BASE}/answer-sheet-requests`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					roll_no: roll,
					test_code: selectedTest,
					requested_phone: cleanPhone
				})
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to submit request');
			}

			setMessage('Request submitted successfully');
			setSelectedTest('');
			setPhone('');
		} catch (err) {
			console.error('Submit error:', err);
			setError(err.message || 'Something went wrong');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-100 p-4 md:p-6">
				<div className="max-w-4xl mx-auto">
					<h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">Request Answer Sheet PDF</h1>
					<div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
						<p className="text-gray-600">Loading...</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-100 p-4 md:p-6">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">Request Answer Sheet PDF</h1>

				<div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
					{student && (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
							<div>
								<p className="text-sm text-gray-500">Student Name</p>
								<p className="text-base font-semibold text-gray-800">{student.name}</p>
							</div>

							<div>
								<p className="text-sm text-gray-500">Roll No</p>
								<p className="text-base font-semibold text-gray-800">{student.roll_no}</p>
							</div>

							<div>
								<p className="text-sm text-gray-500">Class</p>
								<p className="text-base font-semibold text-gray-800">{student.class}</p>
							</div>

							<div>
								<p className="text-sm text-gray-500">Board</p>
								<p className="text-base font-semibold text-gray-800">{student.board}</p>
							</div>
						</div>
					)}

					<form onSubmit={handleSubmit} className="space-y-5">
						<div>
							<label className="block text-gray-700 font-medium mb-2">Select Test Code</label>
							<select
								value={selectedTest}
								onChange={(e) => setSelectedTest(e.target.value)}
								className="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
							>
								<option value="">-- Select Test Code --</option>
								{tests.map((test) => (
									<option key={test.test_code} value={test.test_code}>
										{test.test_code}
									</option>
								))}
							</select>

							{tests.length === 0 && (
								<p className="text-sm text-red-500 mt-2">
									No test codes available from your test schedule.
								</p>
							)}
						</div>

						<div>
							<label className="block text-gray-700 font-medium mb-2">Phone Number to Receive PDF</label>
							<input
								type="text"
								value={phone}
								onChange={(e) => {
									const onlyDigits = e.target.value.replace(/\D/g, '');
									if (onlyDigits.length <= 10) {
										setPhone(onlyDigits);
									}
								}}
								placeholder="Enter 10 digit phone number"
								className="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						{error && (
							<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
								{error}
							</div>
						)}

						{message && (
							<div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
								{message}
							</div>
						)}

						<button
							type="submit"
							disabled={submitting || tests.length === 0}
							className="bg-blue-700 text-white px-6 py-3 rounded-lg hover:bg-blue-800 disabled:bg-gray-400 transition"
						>
							{submitting ? 'Submitting...' : 'Request PDF'}
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}
