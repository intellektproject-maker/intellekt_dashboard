"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://responsible-wonder-production.up.railway.app";

const subjectMap = {
  MATHS: 1,
  PHYSICS: 2,
};

const subjectNameMap = {
  1: "MATHS",
  2: "PHYSICS",
};

function toInputDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "-";

  const text = String(value);

  if (text.includes("T")) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }
  }

  const parts = text.split(":");
  if (parts.length >= 2) {
    let hour = Number(parts[0]);
    const minute = parts[1];
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${suffix}`;
  }

  return text;
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}, ${date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })}`;
}

function ManageAttendancePageInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  const [activeTab, setActiveTab] = useState("report");

  const [classOptions, setClassOptions] = useState([]);
  const [classBoard, setClassBoard] = useState("");
  const [subject, setSubject] = useState("");
  const [filterText, setFilterText] = useState("");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [rows, setRows] = useState([]);
  const [markedRows, setMarkedRows] = useState([]);

  const [loading, setLoading] = useState(false);
  const [markedLoading, setMarkedLoading] = useState(false);
const [markedSearched, setMarkedSearched] = useState(false);
const [classesLoading, setClassesLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [showExportPopup, setShowExportPopup] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  // Removed auto fetch for marked attendance

  async function fetchClasses() {
    try {
      setClassesLoading(true);

      const res = await fetch(`${API_BASE}/classes`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        setClassOptions([]);
        return;
      }

      const formattedClasses = data
        .map((item) => {
          const board = item.board || "";
          const className =
            item.class || item.class_name || item.className || "";

          if (!board || !className) return null;

          return `${board}-${className}`;
        })
        .filter(Boolean);

      setClassOptions([...new Set(formattedClasses)]);
    } catch (err) {
      console.error("Fetch classes error:", err);
      setClassOptions([]);
    } finally {
      setClassesLoading(false);
    }
  }

  async function fetchReport() {
    if (!classBoard) {
      alert("Please select class");
      return;
    }

    if (!fromDate || !toDate) {
      alert("Please select from date and to date");
      return;
    }

    if (new Date(fromDate) > new Date(toDate)) {
      alert("From date cannot be greater than To date");
      return;
    }

    try {
      setLoading(true);
      setRows([]);

      const params = new URLSearchParams();
      params.append("mode", "report");
      params.append("class", classBoard);
      params.append("from", fromDate);
      params.append("to", toDate);

      if (subject) {
        params.append("subject", subjectMap[subject]);
      }

      const res = await fetch(`${API_BASE}/attendance?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to fetch attendance report");
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
      console.error("Fetch report error:", err);
      alert("Failed to fetch attendance report");
    } finally {
      setLoading(false);
    }
  }

  async function fetchMarkedAttendance() {
  if (!classBoard) {
    alert("Please select class");
    return;
  }

  if (!subject) {
    alert("Please select subject");
    return;
  }

  try {
    setMarkedLoading(true);
    setMarkedRows([]);
    setMarkedSearched(true);

    const params = new URLSearchParams();
    params.append("mode", "markedToday");
    params.append("class", classBoard);
    params.append("subject", subjectMap[subject]);

    const res = await fetch(`${API_BASE}/attendance?${params.toString()}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to fetch marked attendance");
      return;
    }

    const prepared = Array.isArray(data)
      ? data.map((row) => ({
          ...row,
          isEditing: false,
          editedStatus: row.status,
        }))
      : [];

    setMarkedRows(prepared);
  } catch (err) {
    console.error("Fetch marked attendance error:", err);
    alert("Failed to fetch marked attendance");
  } finally {
    setMarkedLoading(false);
  }
}

  function getRowKey(row) {
    return `${row.roll_no}-${row.subject_id}-${toInputDate(
      row.attendance_date
    )}`;
  }

  function startEdit(rowKey, type = "report") {
    const setter = type === "marked" ? setMarkedRows : setRows;

    setter((prev) =>
      prev.map((row) =>
        getRowKey(row) === rowKey
          ? { ...row, isEditing: true, editedStatus: row.status }
          : row
      )
    );
  }

  function cancelEdit(rowKey, type = "report") {
    const setter = type === "marked" ? setMarkedRows : setRows;

    setter((prev) =>
      prev.map((row) =>
        getRowKey(row) === rowKey
          ? { ...row, isEditing: false, editedStatus: row.status }
          : row
      )
    );
  }

  function handleEditedStatusChange(rowKey, value, type = "report") {
    const setter = type === "marked" ? setMarkedRows : setRows;

    setter((prev) =>
      prev.map((row) =>
        getRowKey(row) === rowKey ? { ...row, editedStatus: value } : row
      )
    );
  }

  async function saveSingleRow(rowKey, type = "report") {
    const sourceRows = type === "marked" ? markedRows : rows;
    const setter = type === "marked" ? setMarkedRows : setRows;
    const row = sourceRows.find((item) => getRowKey(item) === rowKey);

    if (!row || !row.isEditing) return;

    if (row.editedStatus === row.status) {
      cancelEdit(rowKey, type);
      return;
    }

    const ok = window.confirm(
      `Change attendance for ${row.roll_no} from ${row.status} to ${row.editedStatus}?`
    );

    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/attendance`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
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
        alert(data.error || "Failed to update attendance");
        return;
      }

      setter((prev) =>
        prev.map((item) =>
          getRowKey(item) === rowKey
            ? {
                ...item,
                status: row.editedStatus,
                editedStatus: row.editedStatus,
                isEditing: false,
                edited_by: facultyId || item.edited_by,
                edited_at: new Date().toISOString(),
              }
            : item
        )
      );

      alert("Attendance updated successfully");
    } catch (err) {
      console.error("Save row error:", err);
      alert("Failed to update attendance");
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

  const filteredMarkedRows = useMemo(() => {
    const text = filterText.trim().toLowerCase();

    return markedRows.filter((row) => {
      const nameMatch = row.name?.toLowerCase().includes(text);
      const rollMatch = row.roll_no?.toLowerCase().includes(text);
      const textMatch = !text || nameMatch || rollMatch;

      const statusMatch =
        !statusFilter ||
        row.status?.toLowerCase() === statusFilter.toLowerCase();

      return textMatch && statusMatch;
    });
  }, [markedRows, filterText, statusFilter]);

  function exportExcel() {
    if (filteredRows.length === 0) {
      alert("No data to export");
      return;
    }

    const html = `
      <table border="1">
        <tr>
          <th>Roll No</th>
          <th>Name</th>
          <th>Class</th>
          <th>Board</th>
          <th>Subject</th>
          <th>Date</th>
          <th>Time</th>
          <th>Status</th>
          <th>Marked By</th>
          <th>Edited By</th>
          <th>Edited At</th>
        </tr>
        ${filteredRows
          .map(
            (row) => `
          <tr>
            <td>${row.roll_no || ""}</td>
            <td>${row.name || ""}</td>
            <td>${row.class || ""}</td>
            <td>${row.board || ""}</td>
            <td>${subjectNameMap[row.subject_id] || row.subject_id || ""}</td>
            <td>${formatDate(row.attendance_date)}</td>
            <td>${formatTime(row.attendance_time)}</td>
            <td>${row.status || ""}</td>
            <td>${row.updated_by || ""}</td>
            <td>${row.edited_by || ""}</td>
            <td>${formatDateTime(row.edited_at)}</td>
          </tr>
        `
          )
          .join("")}
      </table>
    `;

    const blob = new Blob([html], {
      type: "application/vnd.ms-excel",
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "attendance_report.xls";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
    setShowExportPopup(false);
  }

  function exportPDF() {
    if (filteredRows.length === 0) {
      alert("No data to export");
      return;
    }

    const tableRows = filteredRows
      .map(
        (row) => `
        <tr>
          <td>${row.roll_no || ""}</td>
          <td>${row.name || ""}</td>
          <td>${row.class || ""}</td>
          <td>${row.board || ""}</td>
          <td>${subjectNameMap[row.subject_id] || row.subject_id || ""}</td>
          <td>${formatDate(row.attendance_date)}</td>
          <td>${formatTime(row.attendance_time)}</td>
          <td>${row.status || ""}</td>
          <td>${row.updated_by || ""}</td>
          <td>${row.edited_by || "-"}</td>
          <td>${formatDateTime(row.edited_at)}</td>
        </tr>
      `
      )
      .join("");

    const printWindow = window.open("", "_blank");

    printWindow.document.write(`
      <html>
        <head>
          <title>Attendance Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h2 { color: #0b3d91; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #0b3d91; color: white; padding: 8px; border: 1px solid #ccc; text-align: left; }
            td { padding: 8px; border: 1px solid #ccc; }
          </style>
        </head>
        <body>
          <h2>Attendance Report</h2>
          <p><strong>Class:</strong> ${classBoard}</p>
          <p><strong>From:</strong> ${formatDate(fromDate)} <strong>To:</strong> ${formatDate(toDate)}</p>
          <table>
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Name</th>
                <th>Class</th>
                <th>Board</th>
                <th>Subject</th>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
                <th>Marked By</th>
                <th>Edited By</th>
                <th>Edited At</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();

    setShowExportPopup(false);
  }

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-6">
        Manage Attendance
      </h1>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => setActiveTab("report")}
          className={`px-5 py-2 rounded-lg font-semibold ${
            activeTab === "report"
              ? "bg-blue-700 text-white"
              : "bg-gray-100 text-blue-700 hover:bg-blue-50"
          }`}
        >
          Attendance Report
        </button>

        <button
          onClick={() => setActiveTab("marked")}
          className={`px-5 py-2 rounded-lg font-semibold ${
            activeTab === "marked"
              ? "bg-blue-700 text-white"
              : "bg-gray-100 text-blue-700 hover:bg-blue-50"
          }`}
        >
          Marked Attendance
        </button>
      </div>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <select
            value={classBoard}
            onChange={(e) => setClassBoard(e.target.value)}
            className="border rounded-lg px-4 py-3"
          >
            <option value="">
              {classesLoading ? "Loading Classes..." : "Select Class"}
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
            {activeTab === "report" ? (
              <button
                onClick={fetchReport}
                disabled={loading}
                className="bg-blue-700 text-white rounded-lg px-6 py-3 hover:bg-blue-800 w-full md:w-auto disabled:opacity-50"
              >
                {loading ? "Loading..." : "View Report"}
              </button>
            ) : (
              <button
                onClick={fetchMarkedAttendance}
                disabled={markedLoading}
                className="bg-blue-700 text-white rounded-lg px-6 py-3 hover:bg-blue-800 w-full md:w-auto disabled:opacity-50"
              >
                {markedLoading ? "Loading..." : "Refresh Marked Attendance"}
              </button>
            )}
          </div>
        </div>

        {activeTab === "report" && (
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
        )}

        {activeTab === "marked" && (
          <p className="text-gray-600">
            This section shows only today’s marked attendance. Tomorrow it will
            appear empty automatically, while old records still stay in the
            database for reports.
          </p>
        )}
      </div>

      {activeTab === "report" && (
        <>
          {loading && (
            <p className="text-gray-600">Loading attendance report...</p>
          )}

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
                  onClick={() => setShowExportPopup(true)}
                  className="bg-blue-700 text-white px-5 py-2 rounded-lg hover:bg-blue-800"
                >
                  Export
                </button>
              </div>

              {filteredRows.length === 0 ? (
                <p className="text-gray-500">
                  No records match the selected filters.
                </p>
              ) : (
                <AttendanceTable
                  rows={filteredRows}
                  startEdit={startEdit}
                  cancelEdit={cancelEdit}
                  handleEditedStatusChange={handleEditedStatusChange}
                  saveSingleRow={saveSingleRow}
                  type="report"
                />
              )}
            </div>
          )}

          {!loading && rows.length === 0 && (
            <p className="text-gray-500">No attendance records found.</p>
          )}
        </>
      )}

      {activeTab === "marked" && (
        <>
          {markedLoading && (
            <p className="text-gray-600">Loading marked attendance...</p>
          )}

          {!markedLoading && markedRows.length > 0 && (
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
              </div>

              {filteredMarkedRows.length === 0 ? (
                <p className="text-gray-500">
                  No marked records match the selected filters.
                </p>
              ) : (
                <AttendanceTable
                  rows={filteredMarkedRows}
                  startEdit={startEdit}
                  cancelEdit={cancelEdit}
                  handleEditedStatusChange={handleEditedStatusChange}
                  saveSingleRow={saveSingleRow}
                  type="marked"
                />
              )}
            </div>
          )}

          {!markedLoading && markedSearched && markedRows.length === 0 && (
            <p className="text-gray-500">
              No attendance marked today yet.
            </p>
          )}
        </>
      )}

      {showExportPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-[90%] max-w-sm">
            <h2 className="text-xl font-bold text-blue-800 mb-4">
              Export Attendance
            </h2>

            <p className="text-gray-600 mb-5">Choose export format</p>

            <div className="flex flex-col gap-3">
              <button
                onClick={exportPDF}
                className="bg-blue-700 text-white px-5 py-3 rounded-lg hover:bg-blue-800"
              >
                Export as PDF
              </button>

              <button
                onClick={exportExcel}
                className="bg-green-600 text-white px-5 py-3 rounded-lg hover:bg-green-700"
              >
                Export as Excel
              </button>

              <button
                onClick={() => setShowExportPopup(false)}
                className="bg-gray-500 text-white px-5 py-3 rounded-lg hover:bg-gray-600"
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

function AttendanceTable({
  rows,
  startEdit,
  cancelEdit,
  handleEditedStatusChange,
  saveSingleRow,
  type,
}) {
  function getRowKey(row) {
    return `${row.roll_no}-${row.subject_id}-${toInputDate(
      row.attendance_date
    )}`;
  }

  return (
    <table className="w-full border-collapse min-w-[1500px]">
      <thead>
        <tr className="border-b">
          <th className="text-left py-3 px-2 text-blue-700">Roll No</th>
          <th className="text-left py-3 px-2 text-blue-700">Name</th>
          <th className="text-left py-3 px-2 text-blue-700">Class</th>
          <th className="text-left py-3 px-2 text-blue-700">Board</th>
          <th className="text-left py-3 px-2 text-blue-700">Subject</th>
          <th className="text-left py-3 px-2 text-blue-700">Date</th>
          <th className="text-left py-3 px-2 text-blue-700">Time</th>
          <th className="text-left py-3 px-2 text-blue-700">Status</th>
          <th className="text-left py-3 px-2 text-blue-700">Action</th>
          <th className="text-left py-3 px-2 text-blue-700">Marked By</th>
          <th className="text-left py-3 px-2 text-blue-700">Marked At</th>
          <th className="text-left py-3 px-2 text-blue-700">Edited By</th>
          <th className="text-left py-3 px-2 text-blue-700">Edited At</th>
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => {
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
              <td className="py-3 px-2">
                {formatDate(row.attendance_date)}
              </td>
              <td className="py-3 px-2">
                {formatTime(row.attendance_time)}
              </td>

              <td className="py-3 px-2">
                {row.isEditing ? (
                  <select
                    value={row.editedStatus}
                    onChange={(e) =>
                      handleEditedStatusChange(rowKey, e.target.value, type)
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
                      onClick={() => saveSingleRow(rowKey, type)}
                      className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                    >
                      Save
                    </button>

                    <button
                      onClick={() => cancelEdit(rowKey, type)}
                      className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(rowKey, type)}
                    className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
                  >
                    Edit
                  </button>
                )}
              </td>

              <td className="py-3 px-2">{row.updated_by || "-"}</td>
              <td className="py-3 px-2">{formatDateTime(row.marked_at)}</td>
              <td className="py-3 px-2">{row.edited_by || "-"}</td>
              <td className="py-3 px-2">{formatDateTime(row.edited_at)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function ManageAttendancePage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <ManageAttendancePageInner />
    </Suspense>
  );
}