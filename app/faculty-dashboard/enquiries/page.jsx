'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  'https://responsible-wonder-production.up.railway.app';

const FALLBACK_CLASS_OPTIONS = ['10', '11', '12'];
const FALLBACK_BOARD_OPTIONS = ['CBSE', 'ICSE', 'ISC', 'SB', 'State Board'];
const ITEMS_PER_PAGE = 5;

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
    { header: 'EnquiryID', dataKey: 'enq_id' },
    { header: 'Student', dataKey: 'student_name' },
    { header: 'Class', dataKey: 'class_board' },
    { header: 'Mode', dataKey: 'mode_of_education' },
    { header: 'Mobile', dataKey: 'mobile_number' },
    { header: 'Secondary Contact', dataKey: 'secondary_contact' },
    { header: 'Area', dataKey: 'area' },
    { header: 'School', dataKey: 'school_name' },
    { header: 'Subjects Looking For', dataKey: 'subjects' },
    { header: 'Academic From', dataKey: 'academic_year_from' },
    { header: 'Academic To', dataKey: 'academic_year_to' },
    { header: 'Parent', dataKey: 'parent_name' },
    { header: 'Reference', dataKey: 'reference' },
    { header: 'Status', dataKey: 'status' },
    { header: 'Pending Reason', dataKey: 'comment' },
    { header: 'Date', dataKey: 'created_at' },
  ];

  const tableRows = filteredData.map((item) => ({
    enq_id: item.enq_id || '-',
    student_name: item.student_name || '-',
    class_board: item.class_board || '-',
    mode_of_education: item.mode_of_education || '-',
    mobile_number: item.mobile_number || '-',
    secondary_contact: item.secondary_contact || '-',
    area: item.area || '-',
    school_name: item.school_name || '-',
    subjects: item.subjects || '-',
    academic_year_from: item.academic_year_from || '-',
    academic_year_to: item.academic_year_to || '-',
    parent_name: item.parent_name || '-',
    reference: item.reference || '-',
    status: item.status || 'Pending',
    comment: item.comment || item.reason || '-',
    created_at: item.created_at
      ? new Date(item.created_at).toLocaleDateString('en-IN')
      : '-',
  }));

  doc.autoTable({
    columns: tableColumns,
    body: tableRows,
    startY: 10,
    margin: { left: 5, right: 5 },
    styles: { fontSize: 5.8, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [245, 247, 255] },
  });

  doc.save('Enquiry_Table.pdf');
}

function generateCSV(filteredData) {
  const headers = [
    'EnquiryID',
    'Student',
    'Class',
    'Mode',
    'Mobile',
    'Secondary Contact',
    'Area',
    'School',
    'Subjects Looking For',
    'Academic From',
    'Academic To',
    'Parent',
    'Reference',
    'Status',
    'Pending Reason',
    'Date',
  ];

  const rows = filteredData.map((item) => [
    item.enq_id || '',
    item.student_name || '',
    item.class_board || '',
    item.mode_of_education || '',
    item.mobile_number || '',
    item.secondary_contact || '',
    item.area || '',
    item.school_name || '',
    item.subjects || '',
    item.academic_year_from || '',
    item.academic_year_to || '',
    item.parent_name || '',
    item.reference || '',
    item.status || 'Pending',
    item.comment || item.reason || '',
    item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '',
  ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');

  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Enquiries.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function EnquiriesPage() {
  const [data, setData] = useState([]);
  const [classOptions, setClassOptions] = useState(FALLBACK_CLASS_OPTIONS);
  const [boardOptions, setBoardOptions] = useState(FALLBACK_BOARD_OPTIONS);

  const [loading, setLoading] = useState(true);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [classFilter, setClassFilter] = useState('');
  const [boardFilter, setBoardFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [phoneFilterError, setPhoneFilterError] = useState('');

  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [classFilter, boardFilter, statusFilter, nameFilter, phoneFilter]);

  async function loadInitialData() {
    await Promise.all([loadData(), loadDropdowns()]);
  }

  async function loadDropdowns() {
    try {
      setDropdownLoading(true);

      const res = await fetch(`${API_BASE}/classes`, {
        cache: 'no-store',
      });

      const json = await res.json();

      if (!res.ok || !Array.isArray(json)) {
        setClassOptions(FALLBACK_CLASS_OPTIONS);
        setBoardOptions(FALLBACK_BOARD_OPTIONS);
        return;
      }

      const classes = json
        .map((item) => String(item.class || item.class_name || '').trim())
        .filter(Boolean);

      const boards = json
        .map((item) => String(item.board || '').trim())
        .filter(Boolean);

      const uniqueClasses = [...new Set(classes)].sort((a, b) =>
        Number(a) - Number(b)
      );

      const uniqueBoards = [...new Set(boards)].sort();

      setClassOptions(
        uniqueClasses.length > 0 ? uniqueClasses : FALLBACK_CLASS_OPTIONS
      );

      setBoardOptions(
        uniqueBoards.length > 0 ? uniqueBoards : FALLBACK_BOARD_OPTIONS
      );
    } catch (err) {
      console.error('Fetch dropdowns error:', err);
      setClassOptions(FALLBACK_CLASS_OPTIONS);
      setBoardOptions(FALLBACK_BOARD_OPTIONS);
    } finally {
      setDropdownLoading(false);
    }
  }

  async function loadData() {
    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/enquiries`, {
        cache: 'no-store',
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json.error || 'Failed to fetch enquiries');
        setData([]);
        return;
      }

      setData(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error('Fetch enquiries error:', err);
      alert('Unable to connect to server');
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    try {
      const confirmDelete = window.confirm(
        'Are you sure you want to reject and delete this enquiry?'
      );

      if (!confirmDelete) return;

      const res = await fetch(`${API_BASE}/enquiries/${id}`, {
        method: 'DELETE',
      });

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
  }

  async function handleUpdate(id, status, comment) {
    if (status === 'Rejected') {
      await handleDelete(id);
      return;
    }

    try {
      const payload = {
        status,
        comment: status === 'Pending' ? comment : '',
        reason: status === 'Pending' ? comment : '',
      };

      const res = await fetch(`${API_BASE}/enquiries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
  }

  function handleNameFilterChange(e) {
    const cleanValue = e.target.value
      .replace(/[^A-Za-z\s]/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s+/, '');

    setNameFilter(cleanValue);
  }

  function handlePhoneFilterChange(e) {
    const cleanValue = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhoneFilter(cleanValue);

    if (cleanValue.length > 0 && cleanValue.length !== 10) {
      setPhoneFilterError('Phone number must contain exactly 10 digits');
    } else {
      setPhoneFilterError('');
    }
  }
const filteredData = useMemo(() => {
  return data
    .filter((item) => {
      const itemClass = getClassValue(item.class_board);
      const itemBoard = getBoardValue(item.class_board);
      const itemStatus = (item.status || 'Pending').trim();
      const itemName = String(item.student_name || '').toLowerCase();
      const itemPhone = String(item.mobile_number || '').replace(/\D/g, '');

      const nameMatch =
        !nameFilter.trim() ||
        itemName.includes(nameFilter.trim().toLowerCase());

      const phoneMatch =
        !phoneFilter || itemPhone.includes(phoneFilter);

      return (
        nameMatch &&
        phoneMatch &&
        (!classFilter || itemClass === classFilter) &&
        (!boardFilter || normalizeBoard(itemBoard) === normalizeBoard(boardFilter)) &&
        (!statusFilter || itemStatus === statusFilter)
      );
    })
    .sort((a, b) => {
      const aNum = Number(String(a.enq_id || '').replace(/\D/g, '')) || a.id || 0;
      const bNum = Number(String(b.enq_id || '').replace(/\D/g, '')) || b.id || 0;
      return aNum - bNum;
    });
}, [data, classFilter, boardFilter, statusFilter, nameFilter, phoneFilter]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE) || 1;

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);

  function clearFilters() {
    setClassFilter('');
    setBoardFilter('');
    setStatusFilter('');
    setNameFilter('');
    setPhoneFilter('');
    setPhoneFilterError('');
    setCurrentPage(1);
  }

  async function handleGeneratePDF() {
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
  }

  function handleExportClick() {
    if (filteredData.length === 0) {
      alert('No data to export.');
      return;
    }

    setShowExportModal(true);
  }

  if (loading) {
    return <div className="p-6 md:p-10 text-gray-700">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-10">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl md:text-3xl font-bold text-blue-800">
          Enquiries
        </h2>

        <div className="hidden md:block">
          <button
            onClick={handleExportClick}
            disabled={pdfLoading || filteredData.length === 0}
            className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 transition"
          >
            {pdfLoading ? 'Generating PDF...' : 'Export'}
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl bg-white p-4 shadow-md border border-gray-200">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start">
          <div>
            <input
              type="text"
              value={nameFilter}
              onChange={handleNameFilterChange}
              placeholder="Search by name"
              className="w-full md:w-[190px] rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-700"
              autoComplete="off"
            />
          </div>

          <div>
            <input
              type="tel"
              value={phoneFilter}
              onChange={handlePhoneFilterChange}
              placeholder="Search by phone"
              className={`w-full md:w-[190px] rounded-lg border px-4 py-2 text-sm outline-none focus:border-blue-700 ${
                phoneFilterError ? 'border-red-500' : 'border-gray-300'
              }`}
              inputMode="numeric"
              maxLength={10}
              autoComplete="off"
            />
            {phoneFilterError && (
              <p className="mt-1 text-xs text-red-500">{phoneFilterError}</p>
            )}
          </div>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-700"
          >
            <option value="">
              {dropdownLoading ? 'Loading Classes...' : 'All Classes'}
            </option>

            {classOptions.map((c) => (
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
            <option value="">
              {dropdownLoading ? 'Loading Boards...' : 'All Boards'}
            </option>

            {boardOptions.map((b) => (
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

      <div className="rounded-xl bg-white p-4 md:p-6 shadow-md border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[2600px] table-fixed border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="w-[130px] px-4 py-3 text-left text-base font-semibold text-blue-700">EnquiryID</th>
                <th className="w-[150px] px-4 py-3 text-left text-base font-semibold text-blue-700">Student</th>
                <th className="w-[130px] px-4 py-3 text-left text-base font-semibold text-blue-700">Class</th>
                <th className="w-[110px] px-4 py-3 text-left text-base font-semibold text-blue-700">Mode</th>
                <th className="w-[140px] px-4 py-3 text-left text-base font-semibold text-blue-700">Mobile</th>
                <th className="w-[160px] px-4 py-3 text-left text-base font-semibold text-blue-700">Secondary Contact</th>
                <th className="w-[160px] px-4 py-3 text-left text-base font-semibold text-blue-700">Area</th>
                <th className="w-[180px] px-4 py-3 text-left text-base font-semibold text-blue-700">School</th>
                <th className="w-[170px] px-4 py-3 text-left text-base font-semibold text-blue-700">Subjects Looking For</th>
                <th className="w-[150px] px-4 py-3 text-left text-base font-semibold text-blue-700">Academic From</th>
                <th className="w-[150px] px-4 py-3 text-left text-base font-semibold text-blue-700">Academic To</th>
                <th className="w-[150px] px-4 py-3 text-left text-base font-semibold text-blue-700">Parent</th>
                <th className="w-[160px] px-4 py-3 text-left text-base font-semibold text-blue-700">Reference</th>
                <th className="w-[120px] px-4 py-3 text-left text-base font-semibold text-blue-700">Date</th>
                <th className="w-[180px] px-4 py-3 text-left text-base font-semibold text-blue-700">Status</th>
                <th className="w-[230px] px-4 py-3 text-left text-base font-semibold text-blue-700">Pending Reason</th>
                <th className="w-[110px] px-4 py-3 text-left text-base font-semibold text-blue-700">Action</th>
              </tr>
            </thead>

            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="17" className="px-4 py-6 text-center text-gray-600">
                    No enquiries found
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <Row key={item.id} item={item} onSave={handleUpdate} />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-gray-600">
            Showing{' '}
            {filteredData.length === 0
              ? 0
              : (currentPage - 1) * ITEMS_PER_PAGE + 1}{' '}
            to {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of{' '}
            {filteredData.length} enquiries
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <span className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 md:hidden">
        <button
          onClick={handleExportClick}
          disabled={pdfLoading || filteredData.length === 0}
          className="w-full rounded-lg bg-blue-700 py-3 text-sm font-semibold text-white shadow hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 transition"
        >
          {pdfLoading ? 'Generating PDF...' : `Export (${filteredData.length})`}
        </button>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[320px] rounded-xl bg-white p-6 shadow-lg border border-gray-200">
            <h3 className="mb-4 text-center text-lg font-semibold text-blue-800">
              Export Options
            </h3>

            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  setShowExportModal(false);
                  await handleGeneratePDF();
                }}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition"
              >
                Export as PDF
              </button>

              <button
                onClick={() => {
                  setShowExportModal(false);
                  generateCSV(filteredData);
                }}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition"
              >
                Export as Excel Sheet
              </button>

              <button
                onClick={() => setShowExportModal(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeBoard(board) {
  const value = String(board || '').trim().toUpperCase();

  if (value === 'STATE BOARD' || value === 'STATEBOARD') return 'SB';
  return value;
}

function getBoardValue(classBoard) {
  if (!classBoard) return '';

  const value = String(classBoard).trim();
  const lastDash = value.lastIndexOf('-');

  if (lastDash === -1) return value.toUpperCase();

  return value.slice(0, lastDash).toUpperCase();
}

function getClassValue(classBoard) {
  if (!classBoard) return '';

  const value = String(classBoard).trim();
  const lastDash = value.lastIndexOf('-');

  if (lastDash === -1) return value.toUpperCase();

  return value.slice(lastDash + 1).toUpperCase();
}

function isSavedEnquiry(item) {
  const savedStatus = item.status && item.status !== 'Pending';
  const savedPendingReason =
    (item.status || 'Pending') === 'Pending' &&
    Boolean((item.comment || item.reason || '').trim());

  return savedStatus || savedPendingReason;
}

function Row({ item, onSave }) {
  const [status, setStatus] = useState(item.status || 'Pending');
  const [comment, setComment] = useState(item.comment || item.reason || '');
  const [isEditing, setIsEditing] = useState(!isSavedEnquiry(item));

  useEffect(() => {
    setStatus(item.status || 'Pending');
    setComment(item.comment || item.reason || '');
    setIsEditing(!isSavedEnquiry(item));
  }, [item]);

  function handleAction() {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    if (status === 'Pending' && !comment.trim()) {
      alert('Please enter the reason for pending');
      return;
    }

    onSave(item.id, status, status === 'Pending' ? comment : '');
  }

  return (
    <tr className="border-b border-gray-300">
      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.enq_id || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.student_name || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.class_board || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        <span
          className={`inline-block rounded-md px-3 py-1 text-xs font-semibold ${
            item.mode_of_education === 'Online'
              ? 'bg-blue-100 text-blue-700'
              : item.mode_of_education === 'Offline'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {item.mode_of_education || '-'}
        </span>
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.mobile_number || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.secondary_contact || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.area || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.school_name || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.subjects || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.academic_year_from || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.academic_year_to || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.parent_name || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.reference || '-'}
      </td>

      <td className="px-4 py-3 text-left text-gray-800 align-top">
        {item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '-'}
      </td>

      <td className="px-4 py-3 text-left align-top">
        <select
          value={status}
          disabled={!isEditing}
          onChange={(e) => {
            const value = e.target.value;
            setStatus(value);

            if (value !== 'Pending') {
              setComment('');
            }
          }}
          className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-800 outline-none focus:border-blue-700 ${
            !isEditing ? 'cursor-not-allowed opacity-70' : ''
          }`}
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
            disabled={!isEditing}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Enter reason for pending"
            className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-800 outline-none focus:border-blue-700 ${
              !isEditing ? 'cursor-not-allowed opacity-70' : ''
            }`}
          />
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>

      <td className="px-4 py-3 text-left align-top">
        <button
          onClick={handleAction}
          className="rounded-md px-3 py-2 text-gray-900 hover:bg-gray-100"
        >
          {isEditing ? 'Save' : 'Edit'}
        </button>
      </td>
    </tr>
  );
}