"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import TestBatchManager from "../../test-batch/components/TestBatchManager";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://responsible-wonder-production.up.railway.app";
const STUDENTS_PER_PAGE = 10;

function ManageStudentsPageInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
const [boardFilter, setBoardFilter] = useState("");

  const [editingRollNo, setEditingRollNo] = useState(null);
  const [phoneError, setPhoneError] = useState("");
  const [rollNoCheck, setRollNoCheck] = useState({ checking: false, exists: false, message: "" });
  const [showStudentPopup, setShowStudentPopup] = useState(false);
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [form, setForm] = useState({
    roll_no: "",
    name: "",
    class: "",
    board: "",
    date_of_birth: "",
    batch: "",
    academic_year_from: "",
    academic_year_to: "",
    parent_name: "",
    secondary_contact: "",
    reference: "",
    phone: "",
    email: "",
    school_name: "",
    password: "",
    subject_ids: [],
    total_fee: "",
    fee_paid: "",
    next_due: "",
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
}, [search, classFilter, boardFilter]);

  async function loadInitialData() {
    try {
      setLoading(true);

      const [studentsRes, subjectsRes] = await Promise.all([
        fetch(`${API_BASE}/students`, { cache: "no-store" }),
        fetch(`${API_BASE}/subjects`, { cache: "no-store" }),
      ]);

      const studentsData = await studentsRes.json();
      const subjectsData = await subjectsRes.json();

      if (!studentsRes.ok) {
        throw new Error(
          studentsData.details ||
            studentsData.error ||
            "Failed to fetch students"
        );
      }

      if (!subjectsRes.ok) {
        throw new Error(
          subjectsData.details ||
            subjectsData.error ||
            "Failed to fetch subjects"
        );
      }

      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
    } catch (err) {
      console.error("Load error:", err);
      alert(err.message || "Failed to load student data");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setRollNoCheck({ checking: false, exists: false, message: "" });
    setForm({
      roll_no: "",
      name: "",
      class: "",
      board: "",
    date_of_birth: "",
    batch: "",
    academic_year_from: "",
    academic_year_to: "",
    parent_name: "",
    secondary_contact: "",
    reference: "",
        phone: "",
      email: "",
      school_name: "",
      password: "",
      subject_ids: [],
      total_fee: "",
      fee_paid: "",
      next_due: "",
    });
    setEditingRollNo(null);
    setPhoneError("");
  }

  function openAddStudentPopup() {
    setRollNoCheck({ checking: false, exists: false, message: "" });
    setForm({
      roll_no: "",
      name: "",
      class: "",
      board: "",
    date_of_birth: "",
    batch: "",
    academic_year_from: "",
    academic_year_to: "",
    parent_name: "",
    secondary_contact: "",
    reference: "",
        phone: "",
      email: "",
      school_name: "",
      password: "",
      subject_ids: [],
      total_fee: "",
      fee_paid: "",
      next_due: "",
    });

    setEditingRollNo(null);
    setPhoneError("");
    setShowStudentPopup(true);
  }

  function closeStudentPopup() {
    resetForm();
    setShowStudentPopup(false);
  }

  function validatePhone(phoneValue) {
    if (!phoneValue.trim()) return "Phone number is required";
    if (!/^\d+$/.test(phoneValue))
      return "Phone number must contain only digits";
    if (phoneValue.length !== 10)
      return "Phone number must be exactly 10 digits";
    return "";
  }

  function handleInputChange(e) {
    const { name, value } = e.target;

    if (name === "roll_no") {
      const candidate = value.trim().toLowerCase();
      const duplicate = !editingRollNo && candidate !== "" && students.some(
        (student) => String(student.roll_no || "").trim().toLowerCase() === candidate
      );
      setRollNoCheck({
        checking: false,
        exists: duplicate,
        message: duplicate ? "This roll number already exists. Please enter a different roll number." : "",
      });
    }

    if (name === "phone") {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);

      setForm((prev) => ({
        ...prev,
        phone: digitsOnly,
      }));

      if (digitsOnly.length === 0) {
        setPhoneError("");
      } else if (digitsOnly.length < 10) {
        setPhoneError("Phone number must be exactly 10 digits");
      } else {
        setPhoneError("");
      }

      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function getMathSubjectId() {
    const mathsSubject = subjects.find((subject) =>
      String(subject.subject_name || "").trim().toLowerCase().includes("math")
    );
    return mathsSubject ? Number(mathsSubject.subject_id) : null;
  }

  function getPhysicsSubjectId() {
    const physicsSubject = subjects.find((subject) =>
      String(subject.subject_name || "")
        .trim()
        .toLowerCase()
        .includes("physics")
    );
    return physicsSubject ? Number(physicsSubject.subject_id) : null;
  }

  function getSelectedSubjectOption() {
    const mathsId = getMathSubjectId();
    const physicsId = getPhysicsSubjectId();

    const hasMaths =
      mathsId !== null && form.subject_ids.includes(Number(mathsId));
    const hasPhysics =
      physicsId !== null && form.subject_ids.includes(Number(physicsId));

    if (hasMaths && hasPhysics) return "BOTH";
    if (hasMaths) return "MATHEMATICS";
    if (hasPhysics) return "PHYSICS";
    return "";
  }

  function handleSubjectRadioChange(option) {
    const mathsId = getMathSubjectId();
    const physicsId = getPhysicsSubjectId();

    if (option === "MATHEMATICS") {
      if (mathsId === null) {
        alert("Mathematics subject is not available in subjects table");
        return;
      }

      setForm((prev) => ({
        ...prev,
        subject_ids: [Number(mathsId)],
      }));
      return;
    }

    if (option === "PHYSICS") {
      if (physicsId === null) {
        alert("Physics subject is not available in subjects table");
        return;
      }

      setForm((prev) => ({
        ...prev,
        subject_ids: [Number(physicsId)],
      }));
      return;
    }

    if (option === "BOTH") {
      if (mathsId === null || physicsId === null) {
        alert(
          "Mathematics or Physics subject is not available in subjects table"
        );
        return;
      }

      setForm((prev) => ({
        ...prev,
        subject_ids: [Number(mathsId), Number(physicsId)],
      }));
    }
  }

  const classOptions = useMemo(() => {
    const vals = [...new Set(students.map((s) => s.class).filter(Boolean))];
    return vals.sort();
  }, [students]);
  const boardOptions = useMemo(() => {
  const vals = [...new Set(students.map((s) => s.board).filter(Boolean))];
  return vals.sort();
}, [students]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();

    return students.filter((student) => {
      const searchMatch =
        !q ||
        student.roll_no?.toLowerCase().includes(q) ||
        student.name?.toLowerCase().includes(q) ||
        student.phone?.toLowerCase().includes(q) ||
        student.email?.toLowerCase().includes(q) ||
        student.school_name?.toLowerCase().includes(q) ||
        student.password?.toLowerCase().includes(q);

    const classMatch = !classFilter || student.class === classFilter;
const boardMatch = !boardFilter || student.board === boardFilter;

return searchMatch && classMatch && boardMatch;
    });
 }, [students, search, classFilter, boardFilter]);

  const totalPages =
    Math.ceil(filteredStudents.length / STUDENTS_PER_PAGE) || 1;

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * STUDENTS_PER_PAGE;
    const endIndex = startIndex + STUDENTS_PER_PAGE;
    return filteredStudents.slice(startIndex, endIndex);
  }, [filteredStudents, currentPage]);

  function goToPage(pageNumber) {
    if (pageNumber < 1 || pageNumber > totalPages) return;
    setCurrentPage(pageNumber);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (
      !form.roll_no.trim() ||
      !form.name.trim() ||
      !form.class.trim() ||
      !form.board.trim() ||
      !form.phone.trim() ||
      !form.email.trim() ||
      !form.school_name.trim() ||
      !form.password.trim()
    ) {
      alert("Please fill all student details");
      return;
    }

    if (!editingRollNo && students.some((student) =>
      String(student.roll_no || "").trim().toLowerCase() === form.roll_no.trim().toLowerCase()
    )) {
      setRollNoCheck({ checking: false, exists: true, message: "This roll number already exists. Please enter a different roll number." });
      alert("This roll number already exists. Please enter a different roll number.");
      return;
    }

    const finalPhoneError = validatePhone(form.phone);
    if (finalPhoneError) {
      setPhoneError(finalPhoneError);
      alert(finalPhoneError);
      return;
    }

    if (form.subject_ids.length === 0) {
      alert("Please select at least one subject");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        roll_no: form.roll_no.trim(),
        name: form.name.trim(),
        class: form.class.trim(),
        board: form.board.trim(),
        date_of_birth: form.date_of_birth || null,
        batch: form.batch,
        academic_year_from: form.academic_year_from || null,
        academic_year_to: form.academic_year_to || null,
        parent_name: form.parent_name.trim(),
        secondary_contact: form.secondary_contact.trim(),
        reference: form.reference.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        school_name: form.school_name.trim(),
        password: form.password.trim(),
        subject_ids: form.subject_ids,
        total_fee: form.total_fee === "" ? 0 : Number(form.total_fee),
        fee_paid: form.fee_paid === "" ? 0 : Number(form.fee_paid),
        next_due: form.next_due || null,
      };

      let res;

      if (editingRollNo) {
        res = await fetch(`${API_BASE}/students/${editingRollNo}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/students`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        alert(data.details || data.error || "Failed to save student");
        return;
      }

      alert(
        editingRollNo
          ? "Student updated successfully"
          : "Student added successfully"
      );

      closeStudentPopup();
      await loadInitialData();
    } catch (err) {
      console.error("Save error:", err);
      alert("Something went wrong while saving student");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(student) {
    try {
      const res = await fetch(`${API_BASE}/students/${student.roll_no}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data || Array.isArray(data)) {
        alert(data?.details || data?.error || "Failed to load student details");
        return;
      }

      setEditingRollNo(student.roll_no);

      const editPhone = String(data.phone || "").replace(/\D/g, "").slice(0, 10);

      setForm({
        roll_no: data.roll_no || "",
        name: data.name || "",
        class: data.class || "",
        board: data.board || "",
        date_of_birth: data.date_of_birth ? String(data.date_of_birth).slice(0, 10) : "",
        batch: data.batch || "Regular Batch",
        academic_year_from: data.academic_year_from ? String(data.academic_year_from) : "",
        academic_year_to: data.academic_year_to ? String(data.academic_year_to) : "",
        parent_name: data.parent_name || "",
        secondary_contact: String(data.secondary_contact || "").replace(/\D/g, "").slice(0, 10),
        reference: data.reference || "",
        phone: editPhone,
        email: data.email || "",
        school_name: data.school_name || "",
        password: data.password || "",
        subject_ids: Array.isArray(data.subjects)
          ? data.subjects.map((sub) => Number(sub.subject_id))
          : [],
        total_fee: data.total_fee ?? "",
        fee_paid: data.fee_paid ?? "",
        next_due: data.next_due ? String(data.next_due).split("T")[0] : "",
      });

      setPhoneError(
        editPhone && editPhone.length !== 10
          ? "Phone number must be exactly 10 digits"
          : ""
      );

      setShowStudentPopup(true);
    } catch (err) {
      console.error("Edit load error:", err);
      alert("Failed to load student for editing");
    }
  }

  async function handleDelete(rollNo) {
    const confirmed = window.confirm(
      `Are you sure you want to delete student ${rollNo}?`
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/students/${rollNo}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.details || data.error || "Failed to delete student");
        return;
      }

      alert("Student deleted successfully");

      if (editingRollNo === rollNo) {
        resetForm();
      }

      await loadInitialData();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Something went wrong while deleting student");
    }
  }

  async function handleRefreshList() {
    await loadInitialData();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getExportRows() {
    return filteredStudents.map((student) => ({
      roll_no: student.roll_no || "-",
      name: student.name || "-",
      class: student.class || "-",
      board: student.board || "-",
      phone: student.phone || "-",
      email: student.email || "-",
      school_name: student.school_name || "-",
      password: student.password || "-",
      total_fee: student.total_fee ?? 0,
    }));
  }

  function exportAsExcel() {
    const rows = getExportRows();

    if (rows.length === 0) {
      alert("No students available to export");
      return;
    }

    const tableRows = rows
      .map(
        (student) => `
          <tr>
            <td>${escapeHtml(student.roll_no)}</td>
            <td>${escapeHtml(student.name)}</td>
            <td>${escapeHtml(student.class)}</td>
            <td>${escapeHtml(student.board)}</td>
            <td>${escapeHtml(student.phone)}</td>
            <td>${escapeHtml(student.email)}</td>
            <td>${escapeHtml(student.school_name)}</td>
            <td>${escapeHtml(student.password)}</td>
            <td>${escapeHtml(student.total_fee)}</td>
          </tr>`
      )
      .join("");

    const excelContent = `
      <html>
        <head>
          <meta charset="UTF-8" />
        </head>
        <body>
          <table border="1">
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Name</th>
                <th>Class</th>
                <th>Board</th>
                <th>Phone</th>
                <th>Email</th>
                <th>School</th>
                <th>Password</th>
                <th>Total Fee</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
      </html>`;

    const blob = new Blob([excelContent], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "student-list.xls";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportPopup(false);
  }

  function exportAsPdf() {
    const rows = getExportRows();

    if (rows.length === 0) {
      alert("No students available to export");
      return;
    }

    const tableRows = rows
      .map(
        (student) => `
          <tr>
            <td>${escapeHtml(student.roll_no)}</td>
            <td>${escapeHtml(student.name)}</td>
            <td>${escapeHtml(student.class)}</td>
            <td>${escapeHtml(student.board)}</td>
            <td>${escapeHtml(student.phone)}</td>
            <td>${escapeHtml(student.email)}</td>
            <td>${escapeHtml(student.school_name)}</td>
            <td>${escapeHtml(student.password)}</td>
            <td>${escapeHtml(student.total_fee)}</td>
          </tr>`
      )
      .join("");

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert("Please allow popups to export PDF");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Student List</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111827;
            }
            h1 {
              color: #1d4ed8;
              margin-bottom: 4px;
            }
            p {
              margin-top: 0;
              color: #4b5563;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 18px;
              font-size: 11px;
            }
            th {
              background: #1d4ed8;
              color: white;
              text-align: left;
              padding: 8px;
              border: 1px solid #1e40af;
            }
            td {
              padding: 7px;
              border: 1px solid #d1d5db;
            }
            tr:nth-child(even) {
              background: #f9fafb;
            }
            @media print {
              button {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <h1>Student List</h1>
          <p>Total Students: ${rows.length}</p>
          <table>
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Name</th>
                <th>Class</th>
                <th>Board</th>
                <th>Mode</th>
                <th>Phone</th>
                <th>Email</th>
                <th>School</th>
                <th>Password</th>
                <th>Total Fee</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
    setShowExportPopup(false);
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-gray-600 text-lg">Loading student management...</p>
      </div>
    );
  }

  const selectedSubjectOption = getSelectedSubjectOption();

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-blue-700">
          Student Management
        </h1>
        <p className="text-gray-600">Add, edit and delete student details.</p>
        {facultyId && (
          <p className="text-sm text-gray-500">
            Logged in faculty: {facultyId}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-md p-5 md:p-6">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-gray-800">Student List</h2>

         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Search by roll no, name, phone, email, school"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 md:col-span-2"
            />

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All Classes</option>
              {classOptions.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
            <select
  value={boardFilter}
  onChange={(e) => setBoardFilter(e.target.value)}
  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
>
  <option value="">All Boards</option>

  {boardOptions.map((board) => (
    <option key={board} value={board}>
      {board}
    </option>
  ))}
</select>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRefreshList}
              className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-4 py-2 rounded-lg font-medium"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => {
              setSearch("");
setClassFilter("");
setBoardFilter("");
              }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium"
            >
              Clear Filters
            </button>

            <button
              type="button"
              onClick={() => setShowExportPopup(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              Export
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[1600px] border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th className="text-left px-4 py-3">Roll No</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Class</th>
                <th className="text-left px-4 py-3">Board</th>
                <th className="text-left px-4 py-3">Date of Birth</th>
                <th className="text-left px-4 py-3">Batch</th>
                <th className="text-left px-4 py-3">Academic From</th>
                <th className="text-left px-4 py-3">Academic To</th>
                <th className="text-left px-4 py-3">Parent Name</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Secondary Contact</th>
                <th className="text-left px-4 py-3">Reference</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">School</th>
                <th className="text-left px-4 py-3">Password</th>
                <th className="text-left px-4 py-3">Total Fee</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {paginatedStudents.length > 0 ? (
                paginatedStudents.map((student, index) => (
                  <tr
                    key={student.roll_no}
                    className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}
                  >
                    <td className="px-4 py-3 border-b">{student.roll_no}</td>
                    <td className="px-4 py-3 border-b">{student.name}</td>
                    <td className="px-4 py-3 border-b">{student.class}</td>
                    <td className="px-4 py-3 border-b">{student.board}</td>
                    <td className="px-4 py-3 border-b">{student.date_of_birth ? String(student.date_of_birth).slice(0, 10) : ""}</td>
                    <td className="px-4 py-3 border-b">{student.batch || "Regular Batch"}</td>
                    <td className="px-4 py-3 border-b">{student.academic_year_from || ""}</td>
                    <td className="px-4 py-3 border-b">{student.academic_year_to || ""}</td>
                    <td className="px-4 py-3 border-b">{student.parent_name || ""}</td>
                    <td className="px-4 py-3 border-b">{student.phone}</td>
                    <td className="px-4 py-3 border-b">{student.secondary_contact || ""}</td>
                    <td className="px-4 py-3 border-b">{student.reference || ""}</td>
                    <td className="px-4 py-3 border-b">{student.email}</td>
                    <td className="px-4 py-3 border-b">
                      {student.school_name}
                    </td>
                    <td className="px-4 py-3 border-b">
                      {student.password || "-"}
                    </td>
                    <td className="px-4 py-3 border-b">
                      {student.total_fee}
                    </td>
                    <td className="px-4 py-3 border-b">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(student)}
                          className="bg-yellow-400 hover:bg-yellow-500 text-black px-4 py-2 rounded-lg font-medium"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(student.roll_no)}
                          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="11"
                    className="text-center px-4 py-8 text-gray-500"
                  >
                    No students found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="text-sm text-gray-600">
            Showing{" "}
            {filteredStudents.length === 0
              ? 0
              : (currentPage - 1) * STUDENTS_PER_PAGE + 1}{" "}
            to{" "}
            {Math.min(currentPage * STUDENTS_PER_PAGE, filteredStudents.length)}{" "}
            of {filteredStudents.length} students
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              Prev
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                type="button"
                key={page}
                onClick={() => goToPage(page)}
                className={`px-4 py-2 rounded-lg font-medium ${
                  currentPage === page
                    ? "bg-blue-700 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={openAddStudentPopup}
            className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold"
          >
            Add Student
          </button>
        </div>
      </div>

      {showExportPopup && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-xl font-semibold text-gray-800">
                Export Student List
              </h2>

              <button
                type="button"
                onClick={() => setShowExportPopup(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium"
              >
                Close
              </button>
            </div>

            <p className="text-gray-600 mb-5">
              Export currently filtered students. Total: {filteredStudents.length}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={exportAsPdf}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-lg font-semibold"
              >
                Export as PDF
              </button>

              <button
                type="button"
                onClick={exportAsExcel}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-lg font-semibold"
              >
                Export as Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {showStudentPopup && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl p-5 md:p-8 w-full max-w-6xl my-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
              <h2 className="text-xl font-semibold text-gray-800">
                {editingRollNo ? "Edit Student" : "Add Student"}
              </h2>

              <button
                type="button"
                onClick={closeStudentPopup}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium"
              >
                Close
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 md:grid-cols-2 gap-5"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Roll Number
                </label>
                <input
                  type="text"
                  name="roll_no"
                  value={form.roll_no}
                  onChange={handleInputChange}
                  placeholder="Enter roll number (any format)"
                  maxLength={50}
                  autoComplete="off"
                  aria-invalid={rollNoCheck.exists}
                  className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 ${rollNoCheck.exists ? "border-red-500" : ""}`}
                />
                {(() => {
                  const lastStudent = students.length ? students[students.length - 1] : null;
                  return lastStudent ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Last listed student: <span className="font-semibold">{lastStudent.roll_no}</span>
                      {lastStudent.name ? ` — ${lastStudent.name}` : ""}. Enter the next roll number manually.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">Enter a unique roll number in any format.</p>
                  );
                })()}
                {rollNoCheck.exists && (
                  <p role="alert" className="mt-1 text-sm font-medium text-red-600">
                    {rollNoCheck.message || "This roll number already exists."}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Student Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleInputChange}
                  placeholder="Enter student name"
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Class
                </label>
                <input
                  type="text"
                  name="class"
                  value={form.class}
                  onChange={handleInputChange}
                  placeholder="11 or 12"
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Board
                </label>
                <select
                  name="board"
                  value={form.board}
                  onChange={handleInputChange}
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="">Select board</option>
                  <option value="State Board">State Board</option>
                  <option value="CBSE">CBSE</option>
                  <option value="ICSE">ICSE</option>
                  <option value="ISC">ISC</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={form.date_of_birth}
                  onChange={handleInputChange}
                  max={new Date().toISOString().slice(0, 10)}
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch</label>
                <div className="flex flex-wrap gap-5 border rounded-lg px-4 py-3">
                  {["Test Batch", "Regular Batch"].map((batchOption) => (
                    <label key={batchOption} className="flex items-center gap-2">
                      <input type="radio" name="batch" value={batchOption} checked={form.batch === batchOption} onChange={handleInputChange} />
                      <span>{batchOption}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year From</label>
                <select name="academic_year_from" value={form.academic_year_from} onChange={(e) => setForm((prev) => ({...prev, academic_year_from: e.target.value, academic_year_to: prev.academic_year_to && Number(prev.academic_year_to) > Number(e.target.value) ? prev.academic_year_to : ""}))} className="w-full border rounded-lg px-4 py-3 bg-white">
                  <option value="">Select year</option>
                  {Array.from({length: 4}, (_, i) => new Date().getFullYear() + i).map((year) => <option key={year} value={String(year)}>{year}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year To</label>
                <select name="academic_year_to" value={form.academic_year_to} onChange={handleInputChange} className="w-full border rounded-lg px-4 py-3 bg-white">
                  <option value="">Select year</option>
                  {Array.from({length: 5}, (_, i) => new Date().getFullYear() + i).filter((year) => !form.academic_year_from || year > Number(form.academic_year_from)).map((year) => <option key={year} value={String(year)}>{year}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name</label>
                <input type="text" name="parent_name" value={form.parent_name} onChange={handleInputChange} placeholder="Enter parent name" className="w-full border rounded-lg px-4 py-3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Contact</label>
                <input type="tel" name="secondary_contact" value={form.secondary_contact} onChange={(e) => setForm((prev) => ({...prev, secondary_contact: e.target.value.replace(/\D/g, "").slice(0, 10)}))} inputMode="numeric" maxLength={10} placeholder="Enter secondary contact" className="w-full border rounded-lg px-4 py-3" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <input type="text" name="reference" value={form.reference} onChange={handleInputChange} placeholder="Enter reference" maxLength={100} className="w-full border rounded-lg px-4 py-3" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleInputChange}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    if (!/^\d+$/.test(pasted)) {
                      e.preventDefault();
                    }
                  }}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="Enter 10 digit phone number"
                  className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 ${
                    phoneError
                      ? "border-red-500 focus:ring-red-300"
                      : "focus:ring-blue-400"
                  }`}
                />
                {phoneError && (
                  <p className="text-red-500 text-sm mt-1">{phoneError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleInputChange}
                  placeholder="Enter email"
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="text"
                  name="password"
                  value={form.password}
                  onChange={handleInputChange}
                  placeholder="Enter password"
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School Name
                </label>
                <input
                  type="text"
                  name="school_name"
                  value={form.school_name}
                  onChange={handleInputChange}
                  placeholder="Enter school name"
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Enrolled Subjects
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="enrolled_subject"
                      checked={selectedSubjectOption === "MATHEMATICS"}
                      onChange={() => handleSubjectRadioChange("MATHEMATICS")}
                    />
                    <span className="text-gray-700">Mathematics</span>
                  </label>

                  <label className="flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="enrolled_subject"
                      checked={selectedSubjectOption === "PHYSICS"}
                      onChange={() => handleSubjectRadioChange("PHYSICS")}
                    />
                    <span className="text-gray-700">Physics</span>
                  </label>

                  <label className="flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="enrolled_subject"
                      checked={selectedSubjectOption === "BOTH"}
                      onChange={() => handleSubjectRadioChange("BOTH")}
                    />
                    <span className="text-gray-700">Both</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Fee
                </label>
                <input
                  type="number"
                  name="total_fee"
                  value={form.total_fee}
                  onChange={handleInputChange}
                  placeholder="Enter total fee"
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Paid
                </label>
                <input
                  type="number"
                  name="fee_paid"
                  value={form.fee_paid}
                  onChange={handleInputChange}
                  placeholder="Enter paid fee"
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Next Due Date
                </label>
                <input
                  type="date"
                  name="next_due"
                  value={form.next_due}
                  onChange={handleInputChange}
                  className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div className="md:col-span-2 flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-60"
                >
                  {saving
                    ? editingRollNo
                      ? "Updating..."
                      : "Saving..."
                    : editingRollNo
                    ? "Update Student"
                    : "Add Student"}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-3 rounded-lg font-semibold"
                >
                  Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
      <TestBatchManager section="students" />

}

export default function ManageStudentsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ManageStudentsPageInner />
    </Suspense>
  );
}