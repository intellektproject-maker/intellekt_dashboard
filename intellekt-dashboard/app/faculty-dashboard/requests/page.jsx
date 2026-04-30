'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
const API_BASE = '/backend-api';

function RequestsPageInner() {
const searchParams = useSearchParams();
const facultyId = searchParams.get('id');
const [ requests, setRequests ] = useState([]);
const [ loading, setLoading ] = useState(true);
const loadRequests = async () => {
try {
setLoading(true);
const res = await fetch(`${API_BASE}/answer-sheet-requests`, {
cache: 'no-store'
            });
const text = await res.text();
console.log('REQUEST API STATUS:', res.status);
console.log('REQUEST API RESPONSE:', text);
let data = [];
try {
data = text ? JSON.parse(text) : [];
            } catch (err) {
console.error('Response is not JSON:', text);
alert('Backend is not returning JSON. Check backend URL or route.');
setRequests([]);
return;
            }
if (!res.ok) {
throw new Error(data.error || 'Failed to fetch requests');
            }
setRequests(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error loading requests:', error);
setRequests([]);
        } finally {
setLoading(false);
        }
    };
useEffect(() => {
loadRequests();
    }, []);
const markCompleted = async (id) => {
const confirmDelete = window.confirm('Mark this request as completed and remove it from the list?');
if (!confirmDelete) return;
try {
const res = await fetch(`${API_BASE}/answer-sheet-requests/${id}`, {
method: 'DELETE'
            });
const text = await res.text();
const data = text ? JSON.parse(text) : {};
if (!res.ok) {
alert(data.error || 'Failed to delete request');
return;
            }
await loadRequests();
        } catch (error) {
            console.error('Error deleting request:', error);
alert('Something went wrong');
        }
    };
return (
<div className="min-h-screen bg-gray-100 p-4 md:p-6">
<div className="max-w-7xl mx-auto">
<h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">Answer Sheet Requests</h1>
<div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 overflow-x-auto">
{loading ? (
<p className="text-gray-600">Loading requests...</p>
                    ) : requests.length === 0 ? (
<p className="text-gray-600">No requests found.</p>
                    ) : (
<table className="min-w-full border-collapse">
<thead>
<tr className="bg-blue-50">
<th className="text-left p-3 border-b">Student Name</th>
<th className="text-left p-3 border-b">Roll No</th>
<th className="text-left p-3 border-b">Class</th>
<th className="text-left p-3 border-b">Board</th>
<th className="text-left p-3 border-b">Phone</th>
<th className="text-left p-3 border-b">Test Code</th>
<th className="text-left p-3 border-b">Status</th>
<th className="text-left p-3 border-b">Requested At</th>
<th className="text-left p-3 border-b">Action</th>
</tr>
</thead>
<tbody>
{requests.map((item) => (
<tr key={item.id} className="hover:bg-gray-50">
<td className="p-3 border-b">{item.student_name}</td>
<td className="p-3 border-b">{item.roll_no}</td>
<td className="p-3 border-b">{item.class_name}</td>
<td className="p-3 border-b">{item.board}</td>
<td className="p-3 border-b">{item.requested_phone}</td>
<td className="p-3 border-b">{item.test_code}</td>
<td className="p-3 border-b">
<span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700">
{item.status || 'Pending'}
</span>
</td>
<td className="p-3 border-b">
{item.requested_at ? new Date(item.requested_at).toLocaleString() : '-'}
</td>
<td className="p-3 border-b">
<button
onClick={() => markCompleted(item.id)}
className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 transition"
>
                                                Mark Completed
</button>
</td>
</tr>
                                ))}
</tbody>
</table>
                    )}
</div>
</div>
</div>
    );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RequestsPageInner />
    </Suspense>
  );
}