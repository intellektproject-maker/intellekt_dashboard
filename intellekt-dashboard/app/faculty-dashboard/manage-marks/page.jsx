'use client';

import { useEffect, useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';

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

export default function ManageMarks() {
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [testCode, setTestCode] = useState('');

  const [classOptions, setClassOptions] = useState(FALLBACK_CLASSES);
  const [testCodeOptions, setTestCodeOptions] = useState([]);

  const [marksData, setMarksData] = useState([]);
  const [editingRow, setEditingRow] = useState(null);
  const [newMarks, setNewMarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(false);
  const [testCodesLoading, setTestCodesLoading] = useState(false);

  const pdfRef = useRef(null);

  useEffect(() => {
    fetchClasses();
    fetchTestCodes();
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
          const classValue = item.class || item.class_name || item.className || '';

          if (!board || !classValue) return null;
          return `${board}-${classValue}`;
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

  async function fetchTestCodes() {
    try {
      setTestCodesLoading(true);

      const possibleUrls = [
        `${API_BASE}/tests`,
        `${API_BASE}/test-schedule`,
      ];

      let list = [];

      for (const url of possibleUrls) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          const data = await res.json();

          if (res.ok && Array.isArray(data)) {
            list = data;
            break;
          }
        } catch {
          // try next route
        }
      }

      const codes = list
        .map((item) => item.test_code)
        .filter(Boolean);

      setTestCodeOptions([...new Set(codes)]);
    } catch (err) {
      console.error('Fetch test codes error:', err);
      setTestCodeOptions([]);
    } finally {
      setTestCodesLoading(false);
    }
  }

  const fetchMarks = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();

      if (name.trim()) params.append('name', name.trim());
      if (className) params.append('className', className);
      if (testCode.trim()) params.append('testCode', testCode.trim());

      const res = await fetch(`${API_BASE}/marks?${params.toString()}`, {
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to fetch marks');
        setMarksData([]);
        return;
      }

      setMarksData(Array.isArray(data) ? data : []);
      setEditingRow(null);
    } catch (err) {
      console.error('Error fetching marks:', err);
      alert('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (rowIndex, row) => {
    setEditingRow(rowIndex);
    setNewMarks(String(row.marks_obtained ?? ''));
  };

  const updateMarks = async (row) => {
    const normalizedMarks = Number(newMarks);

    if (newMarks === '' || Number.isNaN(normalizedMarks)) {
      alert('Please enter valid marks');
      return;
    }

    if (normalizedMarks < 0) {
      alert('Marks cannot be negative');
      return;
    }

    if (row.total_marks && normalizedMarks > Number(row.total_marks)) {
      alert(`Marks cannot be greater than total marks (${row.total_marks})`);
      return;
    }

    const confirmEdit = window.confirm('Confirm updating this mark?');
    if (!confirmEdit) return;

    try {
      const res = await fetch(`${API_BASE}/marks/${row.roll_no}/${row.test_code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks: normalizedMarks }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to update marks');
        return;
      }

      setEditingRow(null);
      setNewMarks('');
      await fetchMarks();
    } catch (err) {
      console.error('Update failed', err);
      alert('Failed to update marks');
    }
  };

  const generatePDF = () => {
    if (marksData.length === 0) {
      alert('No data to export');
      return;
    }

    const element = pdfRef.current;

    const opt = {
      margin: 10,
      filename: `${className || testCode || 'marks'}-report.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    html2pdf().set(opt).from(element).save();
  };

  const clearFilters = () => {
    setName('');
    setClassName('');
    setTestCode('');
    setMarksData([]);
    setEditingRow(null);
    setNewMarks('');
  };

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-6">
        Manage Marks
      </h1>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            placeholder="Student Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded-lg px-4 py-3 w-full md:w-auto text-gray-700"
          />

          <select
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="border rounded-lg px-4 py-3 w-full md:w-auto text-gray-700"
          >
            <option value="">
              {classesLoading ? 'Loading Classes...' : 'All Classes'}
            </option>

            {classOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <input
            list="test-code-options"
            placeholder={
              testCodesLoading ? 'Loading Test Codes...' : 'Test Code'
            }
            value={testCode}
            onChange={(e) => setTestCode(e.target.value)}
            className="border rounded-lg px-4 py-3 w-full md:w-auto text-gray-700"
          />

          <datalist id="test-code-options">
            {testCodeOptions.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={fetchMarks}
              disabled={loading}
              className="bg-blue-700 text-white px-5 py-3 rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>

            <button
              onClick={clearFilters}
              className="bg-gray-100 text-gray-700 px-5 py-3 rounded-lg hover:bg-gray-200"
            >
              Clear
            </button>

            <button
              onClick={generatePDF}
              disabled={marksData.length === 0}
              className="bg-red-600 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📄 Convert to PDF
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-white shadow-md rounded-xl border border-gray-200 p-6">
        {marksData.length === 0 ? (
          <p className="text-gray-500">No marks found.</p>
        ) : (
          <table className="w-full min-w-[800px] border-collapse">
            <thead>
              <tr className="border-b">
                <th className="p-3 text-left text-blue-700">Student Name</th>
                <th className="p-3 text-left text-blue-700">Roll No</th>
                <th className="p-3 text-left text-blue-700">Class</th>
                <th className="p-3 text-left text-blue-700">Test Code</th>
                <th className="p-3 text-left text-blue-700">Marks</th>
                <th className="p-3 text-left text-blue-700">Total</th>
                <th className="p-3 text-left text-blue-700">Action</th>
              </tr>
            </thead>

            <tbody>
              {marksData.map((m, i) => (
                <tr
                  key={`${m.roll_no}-${m.test_code}-${i}`}
                  className="border-b text-gray-700"
                >
                  <td className="p-3">{m.name}</td>
                  <td className="p-3">{m.roll_no}</td>
                  <td className="p-3">{m.class}</td>
                  <td className="p-3">{m.test_code}</td>

                  <td className="p-3">
                    {editingRow === i ? (
                      <input
                        type="number"
                        min="0"
                        max={m.total_marks || undefined}
                        value={newMarks}
                        onChange={(e) => setNewMarks(e.target.value)}
                        className="border rounded-lg px-2 py-1 w-24 text-center"
                      />
                    ) : (
                      m.marks_obtained
                    )}
                  </td>

                  <td className="p-3">{m.total_marks ?? '-'}</td>

                  <td className="p-3">
                    {editingRow === i ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateMarks(m)}
                          className="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700"
                        >
                          Save
                        </button>

                        <button
                          onClick={() => {
                            setEditingRow(null);
                            setNewMarks('');
                          }}
                          className="bg-gray-500 text-white px-3 py-1 rounded-lg hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(i, m)}
                        className="bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={pdfRef} className="p-10 bg-white text-black">
          <h2 className="text-2xl font-bold mb-6">
            {className ? `${className} - Marks Report` : 'Marks Report'}
          </h2>

          <table className="w-full border border-black text-center">
            <thead>
              <tr>
                <th className="p-2 border">Student Name</th>
                <th className="p-2 border">Roll No</th>
                <th className="p-2 border">Class</th>
                <th className="p-2 border">Test Code</th>
                <th className="p-2 border">Marks</th>
                <th className="p-2 border">Total</th>
              </tr>
            </thead>

            <tbody>
              {marksData.map((m, i) => (
                <tr key={`${m.roll_no}-${m.test_code}-pdf-${i}`}>
                  <td className="p-2 border">{m.name}</td>
                  <td className="p-2 border">{m.roll_no}</td>
                  <td className="p-2 border">{m.class}</td>
                  <td className="p-2 border">{m.test_code}</td>
                  <td className="p-2 border">{m.marks_obtained}</td>
                  <td className="p-2 border">{m.total_marks ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-6 text-sm">Auto generated report</p>
        </div>
      </div>
    </div>
  );
}