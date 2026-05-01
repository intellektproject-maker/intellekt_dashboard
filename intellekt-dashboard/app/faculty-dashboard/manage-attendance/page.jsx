'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  'https://responsible-wonder-production.up.railway.app';

const FALLBACK_CLASSES = [
  'CBSE-12',
  'CBSE-10',
  'ISC-12',
  'SB-12',
  'SB-10',
  'ICSE-10',
];

const subjectMap = {
  MATHS: 1,
  PHYSICS: 2,
};

const subjectNameMap = {
  1: 'MATHS',
  2: 'PHYSICS',
};

function ManageAttendancePageInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get('id');

  const [classOptions, setClassOptions] = useState(FALLBACK_CLASSES);
  const [classBoard, setClassBoard] = useState('');
  const [subject, setSubject] = useState('');
  const [filterText, setFilterText] = useState('');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  useEffect(() => {
    fetchClasses();
  }, []);

  async function fetchClasses() {
    try {
      setClassesLoading(true);

      const res = await fetch(`${API_BASE}/classes`, {
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        setClassOptions(FALLBACK_CLASSES);
        return;
      }

      const formattedClasses = data
        .map((item) => {
          const board = item.board || item.Board || '';
          const className = item.class || item.class_name || item.className || '';

          if (!board || !className) return null;

          return `${board}-${className}`;
        })
        .filter(Boolean);

      const uniqueClasses = [...new Set(formattedClasses)];

      setClassOptions(uniqueClasses.length > 0 ? uniqueClasses : FALLBACK_CLASSES);
    } catch (err) {
      console.error('Fetch classes error:', err);
      setClassOptions(FALLBACK_CLASSES);
    } finally {
      setClassesLoading(false);
    }
  }

  async function fetchReport() {
    if (!classBoard) {
      alert('Please select class');
      return;
    }

    if (!fromDate || !toDate) {
      alert('Please select from date and to date');
      return;
    }

    if (new Date(fromDate) > new Date(toDate)) {
      alert('From date cannot be greater than To date');
      return;
    }

    try {
      setLoading(true);
      setRows([]);

      const params = new URLSearchParams();
      params.append('mode', 'report');
      params.append('class', classBoard);
      params.append('from', fromDate);
      params.append('to', toDate);

      if (subject) {
        params.append('subject', subjectMap[subject]);
      }

      const res = await fetch(`${API_BASE}/attendance?${params.toString()}`, {
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to fetch attendance report');
        return;
      }

      const prepared = Array.isArray(data)
        ? data.map((row) => ({
            ...row,
            isEditing: false,
            editedStatus: row.status,
          }))
        : [];

      setRows(prepared);
    } catch (err) {
      console.error('Fetch report error:', err);
      alert('Failed to fetch attendance report');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(rowKey) {
    setRows((prev) =>
      prev.map((row) =>
        getRowKey(row) === rowKey
          ? {
              ...row,
              isEditing: true,
              editedStatus: row.status,
            }
          : row
      )
    );
  }

  function cancelEdit(rowKey) {
    setRows((prev) =>
      prev.map((row) =>
        getRowKey(row) === rowKey
          ? {
              ...row,
              isEditing: false,
              editedStatus: row.status,
            }
          : row
      )
    );
  }

  function handleEditedStatusChange(rowKey, value) {
    setRows((prev) =>
      prev.map((row) =>
        getRowKey(row) === rowKey
          ? {
              ...row,
              editedStatus: value,
            }
          : row
      )
    );
  }

  async function saveSingleRow(rowKey) {
    const row = rows.find((item) => getRowKey(item) === rowKey);

    if (!row || !row.isEditing) return;

    if (row.editedStatus === row.status) {
      cancelEdit(rowKey);
      return;
    }

    const ok = window.confirm(
      `Are you sure you want to change attendance for ${row.roll_no} on ${formatDate(
        row.attendance_date
      )} from ${row.status} to ${row.editedStatus}?`
    );

    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/attendance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [
            {
              roll_no: row.roll_no,
              status: row.editedStatus,
            },
          ],
          subject: row.subject_id,
          facultyId,
          date: toInputDate(row.attendance_date),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to update attendance');
        return;
      }

      setRows((prev) =>
        prev.map((item) =>
          getRowKey(item) === rowKey
            ? {
                ...item,
                status: row.editedStatus,
                editedStatus: row.editedStatus,
                isEditing: false,
                updated_by: facultyId || item.updated_by,
              }
            : item
        )
      );

      alert('Attendance updated successfully');
    } catch (err) {
      console.error('Save row error:', err);
      alert('Failed to update attendance');
    }
  }

  const filteredRows = useMemo(() => {
    const text = filterText.trim().toLowerCase();

    return rows.filter((row) => {
      const nameMatch = row.name?.toLowerCase().includes(text);
      const rollMatch = row.roll_no?.toLowerCase().includes(text);
      const textMatch = !text || nameMatch || rollMatch;

      const statusMatch =
        !statusFilter ||
        row.status?.toLowerCase() === statusFilter.toLowerCase();

      const subjectMatch =
        !subjectFilter ||
        String(row.subject_id) === String(subjectMap[subjectFilter]);

      return textMatch && statusMatch && subjectMatch;
    });
  }, [rows, filterText, statusFilter, subjectFilter]);

  function downloadReport() {
    if (filteredRows.length === 0) {
      alert('No data to download');
      return;
    }

    const header = [
      'Roll No',
      'Name',
      'Class',
      'Board',
      'Subject',
      'Attendance Date',
      'Status',
      'Updated By',
    ];

    const csvRows = filteredRows.map((row) => [
      row.roll_no,
      row.name,
      row.class,
      row.board,
      subjectNameMap[row.subject_id] || row.subject_id,
      formatDate(row.attendance_date),
      row.status,
      row.updated_by,
    ]);

    const csvContent = [header, ...csvRows]
      .map((row) => row.map((cell) => `"${cell ?? ''}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.setAttribute('download', 'attendance_report.csv');

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-6">
        Manage Attendance
      </h1>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <select
            value={classBoard}
            onChange={(e) => setClassBoard(e.target.value)}
            className="border rounded-lg px-4 py-3"
          >
            <option value="">
              {classesLoading ? 'Loading Classes...' : 'Select Class'}
            </option>

            {classOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="border rounded-lg px-4 py-3"
          >
            <option value="">All Subjects</option>
            <option value="MATHS">MATHS</option>
            <option value="PHYSICS">PHYSICS</option>
          </select>

          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search by name or roll no"
            className="border rounded-lg px-4 py-3"
          />

          <div className="md:col-span-2 flex justify-start md:justify-end">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="bg-blue-700 text-white rounded-lg px-6 py-3 hover:bg-blue-800 w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'View Report'}
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-3">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-blue-700 mb-2">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>

          <div className="flex items-center justify-center md:pb-3">
            <div className="text-blue-700 text-2xl font-bold select-none">
              →
            </div>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-semibold text-blue-700 mb-2">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>
        </div>
      </div>

      {loading && <p className="text-gray-600">Loading attendance report...</p>}

      {!loading && rows.length > 0 && (
        <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 overflow-x-auto">
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg px-4 py-2"
            >
              <option value="">All Status</option>
              <option value="Present">Only Present</option>
              <option value="Absent">Only Absent</option>
            </select>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="border rounded-lg px-4 py-2"
            >
              <option value="">All Subjects</option>
              <option value="MATHS">MATHS</option>
              <option value="PHYSICS">PHYSICS</option>
            </select>

            <button
              onClick={downloadReport}
              className="bg-blue-700 text-white px-5 py-2 rounded-lg hover:bg-blue-800"
            >
              Download Report
            </button>
          </div>

          {filteredRows.length === 0 ? (
            <p className="text-gray-500">No records match the selected filters.</p>
          ) : (
            <table className="w-full border-collapse min-w-[1100px]">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 text-blue-700">Roll No</th>
                  <th className="text-left py-3 px-2 text-blue-700">Name</th>
                  <th className="text-left py-3 px-2 text-blue-700">Class</th>
                  <th className="text-left py-3 px-2 text-blue-700">Board</th>
                  <th className="text-left py-3 px-2 text-blue-700">Subject</th>
                  <th className="text-left py-3 px-2 text-blue-700">Date</th>
                  <th className="text-left py-3 px-2 text-blue-700">
                    Current Status
                  </th>
                  <th className="text-left py-3 px-2 text-blue-700">Action</th>
                  <th className="text-left py-3 px-2 text-blue-700">
                    Updated By
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => {
                  const rowKey = getRowKey(row);

                  return (
                    <tr key={rowKey} className="border-b">
                      <td className="py-3 px-2">{row.roll_no}</td>
                      <td className="py-3 px-2">{row.name}</td>
                      <td className="py-3 px-2">{row.class}</td>
                      <td className="py-3 px-2">{row.board}</td>
                      <td className="py-3 px-2">
                        {subjectNameMap[row.subject_id] || row.subject_id}
                      </td>
                      <td className="py-3 px-2">{formatDate(row.attendance_date)}</td>

                      <td className="py-3 px-2">
                        {row.isEditing ? (
                          <select
                            value={row.editedStatus}
                            onChange={(e) =>
                              handleEditedStatusChange(rowKey, e.target.value)
                            }
                            className="border rounded-lg px-3 py-2"
                          >
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                          </select>
                        ) : (
                          <span>{row.status}</span>
                        )}
                      </td>

                      <td className="py-3 px-2">
                        {row.isEditing ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveSingleRow(rowKey)}
                              className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                            >
                              Save
                            </button>

                            <button
                              onClick={() => cancelEdit(rowKey)}
                              className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(rowKey)}
                            className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
                          >
                            Edit
                          </button>
                        )}
                      </td>

                      <td className="py-3 px-2">{row.updated_by || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-gray-500">No attendance records found.</p>
      )}
    </div>
  );
}

function getRowKey(row) {
  return `${row.roll_no}-${row.subject_id}-${toInputDate(row.attendance_date)}`;
}

function toInputDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toLocaleDateString('en-IN');
}

export default function ManageAttendancePageWrapper() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <ManageAttendancePageInner />
    </Suspense>
  );
}