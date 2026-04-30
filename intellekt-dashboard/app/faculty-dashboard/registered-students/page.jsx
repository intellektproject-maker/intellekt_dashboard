'use client';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
const API_BASE = '/backend-api';

function RegisteredStudentsPageInner() {
const searchParams = useSearchParams();
const facultyId = searchParams.get('id');
const [ rows, setRows ] = useState([]);
const [ classes, setClasses ] = useState([]);
const [ loading, setLoading ] = useState(true);
const [ filters, setFilters ] = useState({
className: '',
board: '',
date: ''
    });
useEffect(() => {
loadClasses();
loadRegistrations();
    }, []);
async function loadClasses() {
try {
const res = await fetch(`${API_BASE}/classes`, { cache: 'no-store' });
const data = await res.json();
setClasses(Array.isArray(data) ? data : []);
        } catch (err) {
console.error('Error loading classes:', err);
setClasses([]);
        }
    }
async function loadRegistrations(customFilters = filters) {
try {
setLoading(true);
const params = new URLSearchParams();
if (customFilters.className) params.append('className', customFilters.className);
if (customFilters.board) params.append('board', customFilters.board);
if (customFilters.date) params.append('date', customFilters.date);
const res = await fetch(`${API_BASE}/registered-students?${params.toString()}`, { cache: 'no-store' });
const data = await res.json();
            console.log('REGISTERED STUDENTS FRONTEND DATA:', data);
if (!res.ok) {
alert(data.error || 'Failed to fetch registrations');
setRows([]);
return;
            }
setRows(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error loading registrations:', err);
setRows([]);
        } finally {
setLoading(false);
        }
    }
const boardOptions = useMemo(
        () => {
const uniqueBoards = [ ...new Set(classes.map((c) => c.board).filter(Boolean)) ];
return uniqueBoards;
        },
        [ classes ]
    );
const handleClassChange = (e) => {
const selectedClass = e.target.value;
const selected = classes.find((c) => c.class === selectedClass);
setFilters((prev) => ({
...prev,
className: selectedClass,
board: selected ? selected.board || '' : prev.board
        }));
    };
const handleSearch = () => {
loadRegistrations(filters);
    };
const handleReset = () => {
const cleared = {
className: '',
board: '',
date: ''
        };
setFilters(cleared);
loadRegistrations(cleared);
    };
const formatGroupDate = (dateValue) => {
if (!dateValue) return 'No Test Date';
const date = new Date(dateValue);
if (Number.isNaN(date.getTime())) return 'No Test Date';
return date.toLocaleDateString('en-IN', {
day: '2-digit',
month: 'short',
year: 'numeric'
        });
    };
const groupedRows = useMemo(
        () => {
const sortedRows = [ ...rows ].sort((a, b) => {
const testDateA = a.test_date ? new Date(a.test_date).getTime() : 0;
const testDateB = b.test_date ? new Date(b.test_date).getTime() : 0;
if (testDateA !== testDateB) return testDateA - testDateB;
return String(a.test_code || '').localeCompare(String(b.test_code || ''));
            });
const groups = [];
            sortedRows.forEach((row) => {
const key = row.test_date || 'no-test-date';
const existingGroup = groups.find((group) => group.key === key);
if (existingGroup) {
                    existingGroup.items.push(row);
                } else {
                    groups.push({
                        key,
label: formatGroupDate(row.test_date),
items: [ row ]
                    });
                }
            });
return groups;
        },
        [ rows ]
    );
const downloadPDF = () => {
if (!rows.length) {
alert('No data available to download');
return;
        }
const doc = new jsPDF('landscape');
        doc.setFontSize(16);
        doc.text('Registered Students Report', 14, 15);
const filterText = `Class: ${filters.className || 'All'} | Board: ${filters.board ||
'All'} | Date: ${filters.date || 'All'}`;
        doc.setFontSize(10);
        doc.text(filterText, 14, 22);
let currentY = 30;
        groupedRows.forEach((group, groupIndex) => {
            doc.setFontSize(12);
            doc.text(`Test Date: ${group.label}`, 14, currentY);
autoTable(doc, {
startY: currentY + 4,
head: [
                    [
'Roll No',
'Student Name',
'Class',
'Board',
'Test Code',
'Subject',
'Writing Date',
'Slot',
'Duration'
                    ]
                ],
body: group.items.map((row) => [
                    row.roll_no || '',
                    row.student_name || '',
                    row.class || '',
                    row.board || '',
                    row.test_code || '',
                    row.subject_name || '',
                    row.writing_date || '-',
                    row.slot_label || '',
                    row.duration_minutes ? `${row.duration_minutes} mins` : ''
                ]),
styles: {
fontSize: 9
                },
headStyles: {
fillColor: [ 44, 62, 80 ]
                }
            });
            currentY = doc.lastAutoTable.finalY + 10;
if (groupIndex < groupedRows.length - 1 && currentY > 180) {
                doc.addPage();
                currentY = 20;
            }
        });
        doc.save('registered-students-report.pdf');
    };
return (
<div className="p-6 md:p-10 min-h-[80vh] bg-gray-50">
<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
<h1 className="text-2xl md:text-3xl font-bold text-blue-800">Registered Students</h1>
<button
onClick={downloadPDF}
className="bg-blue-700 text-white px-5 py-3 rounded-lg hover:bg-blue-800 transition"
>
                    Download PDF
</button>
</div>
<div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-6">
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
<select
value={filters.className}
onChange={handleClassChange}
className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
>
<option value="">All Classes</option>
{classes.map((c, index) => (
<option key={index} value={c.class}>
{c.class}
</option>
                        ))}
</select>
<select
value={filters.board}
onChange={(e) => setFilters((prev) => ({ ...prev, board: e.target.value }))}
className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
>
<option value="">All Boards</option>
{boardOptions.map((board, index) => (
<option key={index} value={board}>
{board}
</option>
                        ))}
</select>
<input
type="date"
value={filters.date}
onChange={(e) => setFilters((prev) => ({ ...prev, date: e.target.value }))}
className="border rounded-lg px-4 py-3 text-gray-700"
/>
<div className="flex gap-3">
<button
onClick={handleSearch}
className="flex-1 bg-blue-700 text-white py-3 rounded-lg hover:bg-blue-800 transition"
>
                            Filter
</button>
<button
onClick={handleReset}
className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition"
>
                            Reset
</button>
</div>
</div>
</div>
<div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
{loading ? (
<p className="text-gray-600">Loading registrations...</p>
                ) : rows.length === 0 ? (
<p className="text-gray-600">No registered students found.</p>
                ) : (
<div className="space-y-8">
{groupedRows.map((group) => (
<div key={group.key} className="border border-gray-200 rounded-xl overflow-hidden">
<div className="bg-blue-50 border-b border-gray-200 px-4 py-3">
<h2 className="text-lg md:text-xl font-semibold text-blue-800">
                                        Test Date: {group.label}
</h2>
</div>
<div className="overflow-x-auto">
<table className="min-w-full border text-sm md:text-base rounded-xl overflow-hidden">
<thead className="bg-[#2c3e50] text-white">
<tr>
<th className="p-3 whitespace-nowrap">Roll No</th>
<th className="p-3 whitespace-nowrap">Student Name</th>
<th className="p-3 whitespace-nowrap">Class</th>
<th className="p-3 whitespace-nowrap">Board</th>
<th className="p-3 whitespace-nowrap">Test Code</th>
<th className="p-3 whitespace-nowrap">Subject</th>
<th className="p-3 whitespace-nowrap">Writing Date</th>
<th className="p-3 whitespace-nowrap">Slot</th>
<th className="p-3 whitespace-nowrap">Duration</th>
</tr>
</thead>
<tbody>
{group.items.map((row, index) => (
<tr
key={row.id || `${group.key}-${index}`}
className={`text-center border-b ${index % 2 === 0
                                                        ? 'bg-gray-50'
                                                        : 'bg-white'}`}
>
<td className="p-3 whitespace-nowrap">{row.roll_no}</td>
<td className="p-3 whitespace-nowrap">{row.student_name}</td>
<td className="p-3 whitespace-nowrap">{row.class}</td>
<td className="p-3 whitespace-nowrap">{row.board}</td>
<td className="p-3 whitespace-nowrap">{row.test_code}</td>
<td className="p-3 whitespace-nowrap">{row.subject_name}</td>
<td className="p-3 whitespace-nowrap">{row.writing_date || '-'}</td>
<td className="p-3 whitespace-nowrap">{row.slot_label}</td>
<td className="p-3 whitespace-nowrap">
{row.duration_minutes ? `${row.duration_minutes} mins` : '-'}
</td>
</tr>
                                            ))}
</tbody>
</table>
</div>
</div>
                        ))}
</div>
                )}
</div>
</div>
    );
}

export default function RegisteredStudentsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisteredStudentsPageInner />
    </Suspense>
  );
}