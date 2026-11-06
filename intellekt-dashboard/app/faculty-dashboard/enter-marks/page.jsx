"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://responsible-wonder-production.up.railway.app";

function MarksPageContent() {
  const searchParams = useSearchParams();
  const facultyId = String(searchParams.get("id") || "").trim().toUpperCase();

  const [tests, setTests] = useState([]);
  const [testCode, setTestCode] = useState("");
  const [selectedTest, setSelectedTest] = useState(null);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [comments, setComments] = useState({});
  const [errors, setErrors] = useState({});
  const [savedMarks, setSavedMarks] = useState({});
  const [editRequests, setEditRequests] = useState([]);
  const [editingRoll, setEditingRoll] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const [requestingRoll, setRequestingRoll] = useState("");
  const [overallBusy, setOverallBusy] = useState(false);
  const [manualTotal, setManualTotal] = useState("");
  const [loadingTests, setLoadingTests] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingNewMarks, setSavingNewMarks] = useState(false);
  const [testCodeError, setTestCodeError] = useState("");
  const [classError, setClassError] = useState("");
  const [totalError, setTotalError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterBoard, setFilterBoard] = useState("");
  const [filterSubject, setFilterSubject] = useState("");

  const totalMarks = manualTotal
    ? Number(manualTotal)
    : selectedTest
      ? Number(selectedTest.total_marks)
      : "";

  useEffect(() => {
    let active = true;
    async function loadTests() {
      try {
        const res = await fetch(`${API_BASE}/tests`, { cache: "no-store" });
        const data = await res.json();
        if (active) setTests(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error loading tests:", err);
        if (active) setTests([]);
      } finally {
        if (active) setLoadingTests(false);
      }
    }
    loadTests();
    return () => { active = false; };
  }, []);

  const loadEditRequests = useCallback(async () => {
    if (!facultyId) return [];
    try {
      const res = await fetch(
        `${API_BASE}/record-edit-requests/mine?facultyId=${encodeURIComponent(facultyId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load edit permissions.");
      const list = Array.isArray(data) ? data : [];
      setEditRequests(list);
      return list;
    } catch (err) {
      console.error("Load mark edit requests:", err);
      return editRequests;
    }
  }, [facultyId]);

  function resetTable() {
    setStudents([]);
    setMarks({});
    setComments({});
    setErrors({});
    setSavedMarks({});
    setEditRequests([]);
    setEditingRoll("");
    setEditDraft("");
  }

  function handleTestCode(value) {
    setTestCode(value);
    resetTable();
    setManualTotal("");
    const found = tests.find((t) => String(t.test_code).trim() === String(value).trim());
    if (!found) {
      setSelectedTest(null);
      setTestCodeError(value ? "Invalid test selected" : "");
      return;
    }
    setSelectedTest(found);
    setTestCodeError("");
    setClassError("");
    setTotalError("");
  }

  function generateComment(mark) {
    if (String(mark).toUpperCase() === "A") return "Absent";
    if (!totalMarks) return "";
    const percentage = (Number(mark) / Number(totalMarks)) * 100;
    if (percentage >= 90) return "Excellent";
    if (percentage >= 75) return "Very Good";
    if (percentage >= 60) return "Good";
    if (percentage >= 40) return "Average";
    return "Needs Improvement";
  }

  async function loadStudents() {
    let hasError = false;
    if (!testCode || !selectedTest) {
      setTestCodeError("Select test code");
      hasError = true;
    } else setTestCodeError("");

    if (!selectedTest?.class || !selectedTest?.board) {
      setClassError("Class/board missing for selected test");
      hasError = true;
    } else setClassError("");

    if (!totalMarks || Number(totalMarks) <= 0) {
      setTotalError("Enter total marks");
      hasError = true;
    } else setTotalError("");

    if (hasError) return;
    setLoadingStudents(true);
    try {
      const query = `className=${encodeURIComponent(selectedTest.class)}&board=${encodeURIComponent(selectedTest.board)}&testCode=${encodeURIComponent(testCode)}`;
      const [studentsRes, marksRes] = await Promise.all([
        fetch(`${API_BASE}/enter-marks-students?${query}`, { cache: "no-store" }),
        fetch(`${API_BASE}/marks?testCode=${encodeURIComponent(testCode)}&className=${encodeURIComponent(selectedTest.class)}&board=${encodeURIComponent(selectedTest.board)}`, { cache: "no-store" }),
      ]);
      const studentsData = await studentsRes.json();
      const marksData = await marksRes.json();
      if (!studentsRes.ok) throw new Error(studentsData.error || "Students loading failed");
      if (!marksRes.ok) throw new Error(marksData.error || "Existing marks loading failed");

      const studentList = Array.isArray(studentsData) ? studentsData : [];
      const existing = Array.isArray(marksData) ? marksData : [];
      const marksMap = {};
      const commentsMap = {};
      const savedMap = {};
      existing.forEach((item) => {
        const roll = String(item.roll_no).trim();
        marksMap[roll] = item.marks_obtained == null ? "" : String(item.marks_obtained);
        commentsMap[roll] = item.comments || "";
        savedMap[roll] = true;
      });
      setStudents(studentList);
      setMarks(marksMap);
      setComments(commentsMap);
      setSavedMarks(savedMap);
      setErrors({});
      setEditingRoll("");
      setEditDraft("");
      await loadEditRequests();
      if (!studentList.length) alert("No students found for this test subject/class.");
    } catch (err) {
      console.error("Error loading marks students:", err);
      alert(err.message || "Students loading failed");
    } finally {
      setLoadingStudents(false);
    }
  }

  function handleNewMark(roll, value) {
    const raw = value.trim();
    if (raw === "") {
      setMarks((prev) => ({ ...prev, [roll]: "" }));
      setComments((prev) => ({ ...prev, [roll]: "" }));
      setErrors((prev) => ({ ...prev, [roll]: "Required" }));
      return;
    }
    if (raw.toUpperCase() === "A") {
      setMarks((prev) => ({ ...prev, [roll]: "A" }));
      setComments((prev) => ({ ...prev, [roll]: "Absent" }));
      setErrors((prev) => ({ ...prev, [roll]: "" }));
      return;
    }
    if (!/^\d+$/.test(raw)) {
      setErrors((prev) => ({ ...prev, [roll]: "Only numbers or A" }));
      return;
    }
    const number = Number(raw);
    if (number > Number(totalMarks)) {
      setErrors((prev) => ({ ...prev, [roll]: `Max ${totalMarks}` }));
      return;
    }
    setMarks((prev) => ({ ...prev, [roll]: String(number) }));
    setComments((prev) => ({ ...prev, [roll]: generateComment(number) }));
    setErrors((prev) => ({ ...prev, [roll]: "" }));
  }

  const requestForStudent = (roll) => editRequests.find((request) =>
    request.record_type === "marks" &&
    request.roll_no !== "*" &&
    String(request.roll_no).trim().toUpperCase() === String(roll).trim().toUpperCase() &&
    String(request.test_code).trim().toUpperCase() === String(testCode).trim().toUpperCase()
  );
  const overallRequest = editRequests.find((request) =>
    request.record_type === "marks" &&
    request.roll_no === "*" &&
    String(request.test_code).trim().toUpperCase() === String(testCode).trim().toUpperCase() &&
    ["Pending", "Approved"].includes(request.status)
  );
  const overallApproved = overallRequest?.status === "Approved";
  const existingCount = Object.keys(savedMarks).length;
  const hasExistingMarks = existingCount > 0;
  const newStudents = students.filter((student) => !savedMarks[String(student.roll_no).trim()]);

  async function requestStudentEdit(student) {
    const roll = String(student.roll_no).trim();
    const request = requestForStudent(roll);
    if (overallApproved || request?.status === "Approved") {
      setEditingRoll(roll);
      setEditDraft(String(marks[roll] ?? ""));
      return;
    }
    if (request?.status === "Pending") {
      alert("Your edit request is already pending with the admin.");
      return;
    }
    if (!window.confirm(`Request admin approval to edit marks for ${student.name} (${roll})?`)) return;
    setRequestingRoll(roll);
    try {
      const res = await fetch(`${API_BASE}/record-edit-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultyId,
          recordType: "marks",
          roll_no: roll,
          test_code: testCode,
          requested_value: String(marks[roll] ?? ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not request edit permission.");
      alert(data.message || "Edit request sent to admin.");
      await loadEditRequests();
    } catch (err) {
      alert(err.message || "Could not request edit permission.");
    } finally {
      setRequestingRoll("");
    }
  }

  async function requestOverallEdit() {
    if (!testCode || !students.length || !hasExistingMarks) {
      alert("Load the selected test code and existing marks first.");
      return;
    }
    if (overallRequest) {
      alert(overallApproved
        ? "Overall editing is already approved. You can edit the saved marks below."
        : "An overall edit request is already pending with the admin.");
      return;
    }
    if (!window.confirm(`Request admin approval to edit marks for ALL students under ${testCode}?`)) return;
    setOverallBusy(true);
    try {
      const res = await fetch(`${API_BASE}/record-edit-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultyId,
          recordType: "marks",
          roll_no: "*",
          test_code: testCode,
          requested_value: "BULK_EDIT",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not request overall edit.");
      alert(data.message || "Overall edit request sent to admin.");
      await loadEditRequests();
    } catch (err) {
      alert(err.message || "Could not request overall edit.");
    } finally {
      setOverallBusy(false);
    }
  }

  async function saveApprovedEdit(student) {
    const roll = String(student.roll_no).trim();
    const value = String(editDraft).trim().toUpperCase();
    const permission = overallApproved ? overallRequest : requestForStudent(roll);
    if (!permission || permission.status !== "Approved") {
      alert("Admin approval is required before changing saved marks.");
      setEditingRoll("");
      return;
    }
    if (!value || (value !== "A" && (!/^\d+$/.test(value) || Number(value) > Number(totalMarks)))) {
      alert(`Enter a valid mark from 0 to ${totalMarks}, or A for absent.`);
      return;
    }
    setRequestingRoll(roll);
    try {
      const res = await fetch(`${API_BASE}/record-edit-requests/${permission.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultyId,
          newValue: value,
          ...(permission.roll_no === "*" ? { roll_no: roll } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update marks.");
      setMarks((prev) => ({ ...prev, [roll]: value }));
      setComments((prev) => ({ ...prev, [roll]: generateComment(value) }));
      setEditingRoll("");
      setEditDraft("");
      if (permission.roll_no !== "*") {
        setEditRequests((prev) => prev.filter((item) => String(item.id) !== String(permission.id)));
      }
      alert(data.message || "Approved marks edit applied successfully.");
      await loadStudents();
    } catch (err) {
      alert(err.message || "Could not update marks.");
    } finally {
      setRequestingRoll("");
    }
  }

  async function finishOverallEdit() {
    if (!overallApproved) return;
    if (editingRoll) {
      alert("Save or cancel the current student edit before finishing the overall edit.");
      return;
    }
    if (!window.confirm(`Finish overall editing for ${testCode}? Further changes will require a new admin approval.`)) return;
    setOverallBusy(true);
    try {
      const res = await fetch(`${API_BASE}/record-edit-requests/${overallRequest.id}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facultyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not finish overall edit.");
      alert(data.message || "Overall edit session completed.");
      await loadEditRequests();
    } catch (err) {
      alert(err.message || "Could not finish overall edit.");
    } finally {
      setOverallBusy(false);
    }
  }

  async function submitNewMarks() {
    if (!newStudents.length) {
      alert("There are no new marks to save. Use the Edit request workflow for existing marks.");
      return;
    }
    const newErrors = {};
    newStudents.forEach((student) => {
      const roll = String(student.roll_no).trim();
      if (marks[roll] === "" || marks[roll] === undefined) newErrors[roll] = "Required";
    });
    Object.entries(errors).forEach(([roll, message]) => {
      if (message && newStudents.some((student) => String(student.roll_no).trim() === roll)) newErrors[roll] = message;
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length) {
      alert("Please correct the validation errors and enter marks for all new students.");
      return;
    }
    const records = newStudents.map((student) => {
      const roll = String(student.roll_no).trim();
      return {
        roll_no: roll,
        student_name: student.name,
        marks: marks[roll],
        comments: comments[roll] || "",
        test_code: testCode.toUpperCase().trim(),
        total_marks: totalMarks,
      };
    });
    setSavingNewMarks(true);
    try {
      const res = await fetch(`${API_BASE}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, facultyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error saving marks.");
      alert("New student marks saved successfully.");
      await loadStudents();
    } catch (err) {
      alert(err.message || "Error saving marks.");
    } finally {
      setSavingNewMarks(false);
    }
  }

  const uniqueClasses = useMemo(() => [...new Set(tests.map((test) => test.class).filter(Boolean))], [tests]);
  const uniqueBoards = useMemo(() => [...new Set(tests.map((test) => test.board).filter(Boolean))], [tests]);
  const uniqueSubjects = useMemo(() => [...new Set(tests.map((test) => test.subject_name || test.subject || "").filter(Boolean))], [tests]);
  const filteredTests = tests.filter((test) => {
    const code = String(test.test_code || "");
    return (!searchText || code.toLowerCase().includes(searchText.toLowerCase())) &&
      (!filterClass || String(test.class) === String(filterClass)) &&
      (!filterBoard || String(test.board) === String(filterBoard)) &&
      (!filterSubject || String(test.subject_name || test.subject) === String(filterSubject));
  });

  const exportRows = students.map((student) => {
    const roll = String(student.roll_no).trim();
    return {
      roll,
      name: student.name || "",
      marks: marks[roll] ?? "",
      comments: comments[roll] || "",
      status: savedMarks[roll] ? "Saved" : "New",
    };
  });

  function exportExcel() {
    if (!exportRows.length) return;
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
    const subject = selectedTest?.subject_name || selectedTest?.subject || "";
    const rows = exportRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.roll)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.marks)}</td>
        <td>${escapeHtml(row.comments)}</td>
        <td>${escapeHtml(row.status)}</td>
      </tr>`).join("");
    const html = `<html><head><meta charset="UTF-8"></head><body>
      <table>
        <tr><th colspan="5">INTELLEKT - Marks Report</th></tr>
        <tr><td>Test Code</td><td>${escapeHtml(testCode)}</td></tr>
        <tr><td>Class</td><td>${escapeHtml(selectedTest?.class)}</td></tr>
        <tr><td>Board</td><td>${escapeHtml(selectedTest?.board)}</td></tr>
        <tr><td>Subject</td><td>${escapeHtml(subject)}</td></tr>
        <tr><td>Total Marks</td><td>${escapeHtml(totalMarks)}</td></tr>
        <tr><td>Exported On</td><td>${escapeHtml(new Date().toLocaleString())}</td></tr>
        <tr><th>Roll No</th><th>Student Name</th><th>Marks</th><th>Comment</th><th>Status</th></tr>
        ${rows}
      </table></body></html>`;
    const blob = new Blob(["\\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Marks_${String(testCode).replace(/[^a-z0-9_-]/gi, "_")}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    if (!exportRows.length) return;
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "landscape" });
      const subject = selectedTest?.subject_name || selectedTest?.subject || "";
      doc.setFontSize(16);
      doc.text("INTELLEKT - Marks Report", 14, 16);
      doc.setFontSize(10);
      doc.text(`Test Code: ${testCode}    Class: ${selectedTest?.class || "-"}    Board: ${selectedTest?.board || "-"}`, 14, 24);
      doc.text(`Subject: ${subject || "-"}    Total Marks: ${totalMarks}    Exported: ${new Date().toLocaleString()}`, 14, 31);
      autoTable(doc, {
        startY: 38,
        head: [["Roll No", "Student Name", "Marks", "Comment", "Status"]],
        body: exportRows.map((row) => [row.roll, row.name, row.marks, row.comments, row.status]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [29, 78, 216] },
        margin: { left: 14, right: 14 },
      });
      doc.save(`Marks_${String(testCode).replace(/[^a-z0-9_-]/gi, "_")}.pdf`);
    } catch (err) {
      console.error("Marks PDF export failed:", err);
      alert("Could not export PDF. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-8 text-3xl font-bold text-blue-700">Enter Marks</h2>

        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-md">
          <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Search Test Code</label>
              <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search Test Code" className="w-full rounded-lg border border-gray-300 px-4 py-3" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Filter Class</label>
              <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3">
                <option value="">All Classes</option>
                {uniqueClasses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Filter Board</label>
              <select value={filterBoard} onChange={(e) => setFilterBoard(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3">
                <option value="">All Boards</option>
                {uniqueBoards.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Filter Subject</label>
              <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3">
                <option value="">All Subjects</option>
                {uniqueSubjects.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Test Code</label>
              <select value={testCode} onChange={(e) => handleTestCode(e.target.value)} disabled={loadingTests} className={`w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 ${testCodeError ? "border-red-500" : "border-gray-300"}`}>
                <option value="">{loadingTests ? "Loading tests..." : "Select Test Code"}</option>
                {filteredTests.map((test) => <option key={test.test_code} value={test.test_code}>{test.test_code} — {test.class} — {test.board}</option>)}
              </select>
              {testCodeError && <p className="mt-1 text-xs text-red-500">{testCodeError}</p>}
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Class</label>
              <input readOnly value={selectedTest ? `${selectedTest.class} — ${selectedTest.board}` : ""} placeholder="Auto-filled" className={`w-full rounded-lg border bg-gray-100 px-4 py-3 ${classError ? "border-red-500" : "border-gray-300"}`} />
              {classError && <p className="mt-1 text-xs text-red-500">{classError}</p>}
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Total Marks</label>
              <input type="number" value={manualTotal || totalMarks || ""} onChange={(e) => setManualTotal(e.target.value)} className={`w-full rounded-lg border px-4 py-3 ${totalError ? "border-red-500" : "border-gray-300"}`} />
              {totalError && <p className="mt-1 text-xs text-red-500">{totalError}</p>}
            </div>
            <div className="flex items-end">
              <button onClick={loadStudents} disabled={loadingStudents} className="w-full rounded-lg bg-blue-600 px-5 py-3 text-white hover:bg-blue-700 disabled:bg-blue-300">{loadingStudents ? "Loading..." : "Load Students"}</button>
            </div>
          </div>
        </div>

        {students.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-md">
            {hasExistingMarks && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-medium text-green-700">
                Existing marks are locked. Use the Edit option beside a student to request admin approval before changing saved marks.
              </div>
            )}

            {hasExistingMarks && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
                <div>
                  <p className="font-semibold text-blue-900">Overall marks editing — {testCode}</p>
                  <p className="mt-1 text-sm text-blue-800">
                    {overallRequest?.status === "Pending" ? "Overall edit request is waiting for admin approval." :
                      overallApproved ? "Overall edit approved. You can edit any saved student's marks." :
                        "Request one approval to edit saved marks for every student under this test code."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={requestOverallEdit} disabled={overallBusy || Boolean(overallRequest)} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {overallBusy ? "Processing..." : overallRequest?.status === "Pending" ? "Overall Request Pending" : overallApproved ? "Overall Edit Approved" : "Request Overall Edit"}
                  </button>
                  {overallApproved && <button onClick={finishOverallEdit} disabled={overallBusy || Boolean(editingRoll)} className="rounded-lg bg-gray-700 px-4 py-3 font-semibold text-white disabled:opacity-50">Finish Edit</button>}
                </div>
              </div>
            )}

            <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={exportPdf}
                className="rounded-lg bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-700"
              >
                Export PDF
              </button>
              <button
                onClick={exportExcel}
                className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700"
              >
                Export Excel
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse">
                <thead className="bg-blue-700 text-white">
                  <tr>
                    <th className="p-3 text-left">Roll No</th>
                    <th className="p-3 text-left">Student Name</th>
                    <th className="p-3 text-left">Marks</th>
                    <th className="p-3 text-left">Comment</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Action</th>
                    <th className="p-3 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const roll = String(student.roll_no).trim();
                    const isSaved = Boolean(savedMarks[roll]);
                    const request = requestForStudent(roll);
                    const canEdit = overallApproved || request?.status === "Approved";
                    const isEditing = editingRoll === roll;
                    return (
                      <tr key={roll} className="border-b text-gray-700">
                        <td className="p-3">{roll}</td>
                        <td className="p-3">{student.name}</td>
                        <td className="p-3">
                          {isSaved && isEditing ? (
                            <input type="text" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className="w-24 rounded-lg border px-3 py-2" />
                          ) : isSaved ? (
                            <span className="font-medium">{marks[roll] ?? "-"}</span>
                          ) : (
                            <input type="text" value={marks[roll] ?? ""} onChange={(e) => handleNewMark(roll, e.target.value)} className="w-24 rounded-lg border px-3 py-2" />
                          )}
                        </td>
                        <td className="p-3">{isEditing ? generateComment(editDraft) || "-" : comments[roll] || "-"}</td>
                        <td className="p-3">
                          {isSaved
                            ? <span className="font-semibold text-green-700">Saved · Locked</span>
                            : <span className="font-semibold text-blue-700">New</span>}
                        </td>
                        <td className="p-3">
                          {isSaved && isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => saveApprovedEdit(student)} disabled={requestingRoll === roll} className="rounded-lg bg-green-600 px-3 py-2 text-white disabled:opacity-50">{requestingRoll === roll ? "Saving..." : "Save"}</button>
                              <button onClick={() => { setEditingRoll(""); setEditDraft(""); }} className="rounded-lg bg-gray-500 px-3 py-2 text-white">Cancel</button>
                            </div>
                          ) : isSaved ? (
                            <button onClick={() => requestStudentEdit(student)} disabled={requestingRoll === roll || Boolean(editingRoll)} className="rounded-lg bg-yellow-500 px-3 py-2 font-semibold text-white hover:bg-yellow-600 disabled:opacity-50">
                              {requestingRoll === roll ? "Requesting..." : canEdit ? "Edit (Approved)" : request?.status === "Pending" ? "Request Pending" : "Request Edit"}
                            </button>
                          ) : (
                            <span className="text-sm text-gray-500">Enter new mark</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-red-500">{errors[roll] || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {newStudents.length > 0 && (
              <button onClick={submitNewMarks} disabled={savingNewMarks} className="mt-8 rounded-lg bg-green-600 px-8 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {savingNewMarks ? "Saving..." : `Save New Marks (${newStudents.length})`}
              </button>
            )}
            {newStudents.length === 0 && (
              <p className="mt-6 text-sm text-gray-500">All marks for this test have already been entered. Existing marks can only be changed after admin approval.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarksPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <MarksPageContent />
    </Suspense>
  );
}
