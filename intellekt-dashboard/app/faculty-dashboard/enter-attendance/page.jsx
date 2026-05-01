'use client';

import { useEffect, useState, Suspense } from 'react';
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

function EnterAttendancePageInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get('id');

  const [classOptions, setClassOptions] = useState(FALLBACK_CLASSES);
  const [classBoard, setClassBoard] = useState('');
  const [subject, setSubject] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [absentees, setAbsentees] = useState([]);

  useEffect(() => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
    fetchClasses();
  }, []);

  async function fetchClasses() {
    try {
      setClassesLoading(true);

      const res = await fetch(`${API_BASE}/classes`, { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        setClassOptions(FALLBACK_CLASSES);
        return;
      }

      const formatted = data
        .map((item) => {
          const board = item.board || item.Board || '';
          const className = item.class || item.class_name || item.className || '';

          if (!board || !className) return null;
          return `${board}-${className}`;
        })
        .filter(Boolean);

      const unique = [...new Set(formatted)];
      setClassOptions(unique.length > 0 ? unique : FALLBACK_CLASSES);
    } catch (err) {
      console.error('Fetch classes error:', err);
      setClassOptions(FALLBACK_CLASSES);
    } finally {
      setClassesLoading(false);
    }
  }

  async function loadStudents() {
    if (!classBoard || !subject || !selectedDate) {
      alert('Please select class, subject and date');
      return;
    }

    try {
      setLoading(true);
      setStudents([]);
      setAttendance({});

      const params = new URLSearchParams();
      params.append('class', classBoard);
      params.append('subject', subjectMap[subject]);
      params.append('date', selectedDate);

      const res = await fetch(`${API_BASE}/attendance?${params.toString()}`, {
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to load students');
        return;
      }

      const list = Array.isArray(data) ? data : [];
      setStudents(list);

      const map = {};
      list.forEach((student) => {
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
      [rollNo]: value,
    }));
  }

  function handlePreview() {
    if (students.length === 0) {
      alert('Please load students first');
      return;
    }

    const absentList = students.filter(
      (student) => attendance[student.roll_no] === 'Absent'
    );

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
    setSelectedDate(new Date().toISOString().split('T')[0]);
  }

  async function submitAttendance(overwrite = false) {
    if (students.length === 0) {
      alert('No students loaded');
      return;
    }

    try {
      setSubmitting(true);

      const records = students.map((student) => ({
        roll_no: student.roll_no,
        status: attendance[student.roll_no] || 'Present',
      }));

      const res = await fetch(`${API_BASE}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records,
          subject: subjectMap[subject],
          facultyId,
          date: selectedDate,
          overwrite,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.duplicateFound) {
          const confirmOverwrite = window.confirm(
            'Attendance already exists. Overwrite?'
          );

          if (confirmOverwrite) {
            await submitAttendance(true);
          }

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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 md:p-10 min-h-[80vh] bg-gray-50">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-6">
        Enter Attendance
      </h1>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            disabled={loading}
            className="bg-blue-700 text-white rounded-lg px-4 py-3 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Load Students'}
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-600">Loading students...</p>}

      {!loading && students.length > 0 && (
        <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b text-gray-700">
                  <th className="text-left py-3 px-2 text-blue-700">Roll No</th>
                  <th className="text-left py-3 px-2 text-blue-700">Name</th>
                  <th className="text-left py-3 px-2 text-blue-700">Status</th>
                </tr>
              </thead>

              <tbody>
                {students.map((student) => (
                  <tr key={student.roll_no} className="border-b">
                    <td className="py-3 px-2">{student.roll_no}</td>
                    <td className="py-3 px-2">{student.name}</td>
                    <td className="py-3 px-2">
                      <select
                        value={attendance[student.roll_no] || 'Present'}
                        onChange={(e) =>
                          handleAttendanceChange(student.roll_no, e.target.value)
                        }
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

      {!loading && students.length === 0 && classBoard && subject && (
        <p className="text-gray-500">No students loaded.</p>
      )}

      {showPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-2xl font-bold text-blue-800 mb-4">
              Absentees Preview
            </h2>

            {absentees.length === 0 ? (
              <p className="text-gray-600 mb-4">
                No absentees. All students are present.
              </p>
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
              <button
                onClick={() => setShowPopup(false)}
                disabled={submitting}
                className="px-5 py-2 rounded-lg border"
              >
                Cancel
              </button>

              <button
                onClick={() => submitAttendance(false)}
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EnterAttendancePage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <EnterAttendancePageInner />
    </Suspense>
  );
}