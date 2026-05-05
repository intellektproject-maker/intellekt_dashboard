'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  'https://responsible-wonder-production.up.railway.app';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ✅ PDF
async function generatePDF(filteredData) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });

  const headers = [[
    "Student","Class","Mode","Mobile","Secondary",
    "Area","School","Subjects","Parent","Reference",
    "Status","Reason","Date"
  ]];

  const rows = filteredData.map(item => [
    item.student_name || '',
    item.class_board || '',
    item.mode_of_education || '',
    item.mobile_number || '',
    item.secondary_contact || '',
    item.area || '',
    item.school_name || '',
    item.subjects || '',
    item.parent_name || '',
    item.reference || '',
    item.status || 'Pending',
    item.comment || item.reason || '',
    item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : ''
  ]);

  doc.autoTable({
    head: headers,
    body: rows,
    styles: { fontSize: 7 }
  });

  doc.save('Enquiries.pdf');
}

// ✅ CSV (Excel)
function generateCSV(data) {
  const headers = [
    "Student","Class","Mode","Mobile","Secondary Contact",
    "Area","School","Subjects","Parent","Reference",
    "Status","Pending Reason","Date"
  ];

  const rows = data.map(item => [
    item.student_name,
    item.class_board,
    item.mode_of_education,
    item.mobile_number,
    item.secondary_contact,
    item.area,
    item.school_name,
    item.subjects,
    item.parent_name,
    item.reference,
    item.status,
    item.comment || item.reason,
    item.created_at
      ? new Date(item.created_at).toLocaleDateString('en-IN')
      : ''
  ]);

  const csv =
    [headers, ...rows]
      .map(r => r.map(x => `"${x || ''}"`).join(','))
      .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'Enquiries.csv';
  link.click();
}

export default function EnquiriesPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const res = await fetch(`${API_BASE}/enquiries`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  const filteredData = useMemo(() => data, [data]);

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">

      {/* HEADER */}
      <div className="flex justify-between mb-6">
        <h2 className="text-3xl font-bold text-blue-800">Enquiries</h2>

        <button
          onClick={() => setShowExportModal(true)}
          className="bg-blue-700 text-white px-5 py-2 rounded-lg"
        >
          Export
        </button>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto bg-white p-4 rounded-xl shadow">
        <table className="min-w-[1500px] w-full">
          <thead>
            <tr className="text-blue-700 font-semibold border-b">
              <th>Student</th>
              <th>Class</th>
              <th>Mode</th>
              <th>Mobile</th>
              <th>Secondary</th>
              <th>Area</th>
              <th>School</th>
              <th>Subjects</th>
              <th>Parent</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Date</th>
            </tr>
          </thead>

          <tbody>
            {filteredData.map(item => (
              <tr key={item.id} className="border-b text-sm">
                <td>{item.student_name}</td>
                <td>{item.class_board}</td>
                <td>{item.mode_of_education}</td>
                <td>{item.mobile_number}</td>
                <td>{item.secondary_contact}</td>
                <td>{item.area}</td>
                <td>{item.school_name}</td>
                <td>{item.subjects}</td>
                <td>{item.parent_name}</td>
                <td>{item.reference}</td>
                <td>{item.status}</td>
                <td>{item.comment || item.reason}</td>
                <td>
                  {item.created_at
                    ? new Date(item.created_at).toLocaleDateString('en-IN')
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* EXPORT MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl w-[300px] shadow-lg">
            <h3 className="text-lg font-bold mb-4 text-center">
              Export Options
            </h3>

            <button
              onClick={() => {
                setShowExportModal(false);
                generatePDF(filteredData);
              }}
              className="w-full bg-blue-700 text-white py-2 rounded mb-3"
            >
              Export as PDF
            </button>

            <button
              onClick={() => {
                setShowExportModal(false);
                generateCSV(filteredData);
              }}
              className="w-full bg-green-600 text-white py-2 rounded mb-3"
            >
              Export as Excel (CSV)
            </button>

            <button
              onClick={() => setShowExportModal(false)}
              className="w-full text-gray-600 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}