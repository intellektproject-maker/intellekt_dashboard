
"use client";

import { useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ManageAttendancePageInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  const [classBoard, setClassBoard] = useState("");
  const [subject, setSubject] = useState("");
  const [filterText, setFilterText] = useState("");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const subjectMap = {
    MATHS: 1,
    PHYSICS: 2,
  };

  const subjectNameMap = {
    1: "MATHS",
    2: "PHYSICS",
  };

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

      const params = new URLSearchParams();
      params.append("mode", "report");
      params.append("class", classBoard);
      params.append("from", fromDate);
      params.append("to", toDate);

      if (subject) {
        params.append("subject", subjectMap[subject]);
      }

      const res = await fetch(
        `https://responsible-wonder-production.up.railway.app/attendance?${params.toString()}`
      );
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to fetch attendance report");
        return;
      }

      const prepared = data.map((row) => ({
        ...row,
        isEditing: false,
        editedStatus: row.status,
      }));

      setRows(prepared);
    } catch (err) {
      console.error("Fetch report error:", err);
      alert("Failed to fetch attendance report");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(index) {
    const updated = [...rows];
    updated[index].isEditing = true;
    updated[index].editedStatus = updated[index].status;
    setRows(updated);
  }

  function cancelEdit(index) {
    const updated = [...rows];
    updated[index].isEditing = false;
    updated[index].editedStatus = updated[index].status;
    setRows(updated);
  }

  function handleEditedStatusChange(index, value) {
    const updated = [...rows];
    updated[index].editedStatus = value;
    setRows(updated);
  }

  async function saveSingleRow(index) {
    const row = rows[index];

    if (!row.isEditing) return;

    if (row.editedStatus === row.status) {
      const updated = [...rows];
      updated[index].isEditing = false;
      setRows(updated);
      return;
    }

    const ok = window.confirm(
      `Are you sure you want to change attendance for ${row.roll_no} on ${row.attendance_date} from ${row.status} to ${row.editedStatus}?`
    );

    if (!ok) return;

    try {
      const res = await fetch("https://responsible-wonder-production.up.railway.app/attendance", {
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
          date: row.attendance_date,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to update attendance");
        return;
      }

      const updated = [...rows];
      updated[index].status = updated[index].editedStatus;
      updated[index].isEditing = false;
      setRows(updated);

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

  function downloadReport() {
    if (filteredRows.length === 0) {
      alert("No data to download");
      return;
    }

    const header = [
      "Roll No",
      "Name",
      "Class",
      "Board",
      "Subject",
      "Attendance Date",
      "Status",
      "Updated By",
    ];

    const csvRows = filteredRows.map((row) => [
      row.roll_no,
      row.name,
      row.class,
      row.board,
      subjectNameMap[row.subject_id] || row.subject_id,
      row.attendance_date,
      row.status,
      row.updated_by,
    ]);

    const csvContent = [header, ...csvRows]
      .map((row) => row.map((cell) => `"${cell ?? ""}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "attendance_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-700 mb-6">
        Manage Attendance
      </h1>

      <div className="bg-white shadow-md rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <select
            value={classBoard}
            onChange={(e) => setClassBoard(e.target.value)}
            className="border rounded-lg px-4 py-3"
          >
            <option value="">Select Class</option>
            <option value="CBSE-12">CBSE-12</option>
            <option value="CBSE-10">CBSE-10</option>
            <option value="ISC-12">ISC-12</option>
            <option value="SB-12">SB-12</option>
            <option value="SB-10">SB-10</option>
            <option value="ICSE-10">ICSE-10</option>
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
              className="bg-blue-700 text-white rounded-lg px-6 py-3 hover:bg-blue-800 w-full md:w-auto"
            >
              View Report
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

      {!loading && filteredRows.length > 0 && (
        <div className="bg-white shadow-md rounded-xl p-6 overflow-x-auto">
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

          <table className="w-full border-collapse min-w-[1100px]">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3">Roll No</th>
                <th className="text-left py-3">Name</th>
                <th className="text-left py-3">Class</th>
                <th className="text-left py-3">Board</th>
                <th className="text-left py-3">Subject</th>
                <th className="text-left py-3">Date</th>
                <th className="text-left py-3">Current Status</th>
                <th className="text-left py-3">Action</th>
                <th className="text-left py-3">Updated By</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr
                  key={`${row.roll_no}-${row.subject_id}-${row.attendance_date}`}
                  className="border-b"
                >
                  <td className="py-3">{row.roll_no}</td>
                  <td className="py-3">{row.name}</td>
                  <td className="py-3">{row.class}</td>
                  <td className="py-3">{row.board}</td>
                  <td className="py-3">
                    {subjectNameMap[row.subject_id] || row.subject_id}
                  </td>
                  <td className="py-3">{row.attendance_date}</td>

                  <td className="py-3">
                    {row.isEditing ? (
                      <select
                        value={row.editedStatus}
                        onChange={(e) =>
                          handleEditedStatusChange(index, e.target.value)
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

                  <td className="py-3">
                    {row.isEditing ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveSingleRow(index)}
                          className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => cancelEdit(index)}
                          className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(index)}
                        className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
                      >
                        Edit
                      </button>
                    )}
                  </td>

                  <td className="py-3">{row.updated_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filteredRows.length === 0 && (
        <p className="text-gray-500">No attendance records found.</p>
      )}
    </div>
  );
}
export default function ManageAttendancePageWrapper() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ManageAttendancePageInner />
    </Suspense>
  );
}