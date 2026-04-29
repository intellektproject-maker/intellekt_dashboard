"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "/backend-api";

export default function ManageStudentsPage() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const [editingRollNo, setEditingRollNo] = useState(null);
  const [phoneError, setPhoneError] = useState("");

  const [form, setForm] = useState({
    roll_no: "",
    name: "",
    class: "",
    board: "",
    mode_of_education: "",
    phone: "",
    email: "",
    school_name: "",
    subject_ids: [],
    total_fee: "",
    fee_paid: "",
    next_due: "",
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      setLoading(true);

      const [studentsRes, subjectsRes] = await Promise.all([
        fetch(`${API_BASE}/students`, { cache: "no-store" }),
        fetch(`${API_BASE}/subjects`, { cache: "no-store" }),
      ]);

      const studentsData = await studentsRes.json();
      const subjectsData = await subjectsRes.json();

      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
    } catch (err) {
      console.error("Load error:", err);
      alert("Failed to load student data");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({
      roll_no: "",
      name: "",
      class: "",
      board: "",
      mode_of_education: "",
      phone: "",
      email: "",
      school_name: "",
      subject_ids: [],
      total_fee: "",
      fee_paid: "",
      next_due: "",
    });
    setEditingRollNo(null);
    setPhoneError("");
  }

  function validatePhone(phoneValue) {
    if (!phoneValue.trim()) return "Phone number is required";
    if (!/^\d+$/.test(phoneValue)) return "Phone number must contain only digits";
    if (phoneValue.length !== 10) return "Phone number must be exactly 10 digits";
    return "";
  }

  function handleInputChange(e) {
    const { name, value } = e.target;

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
      String(subject.subject_name || "")
        .trim()
        .toLowerCase()
        .includes("math")
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
        alert("Mathematics or Physics subject is not available in subjects table");
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

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();

    return students.filter((student) => {
      const searchMatch =
        !q ||
        student.roll_no?.toLowerCase().includes(q) ||
        student.name?.toLowerCase().includes(q) ||
        student.phone?.toLowerCase().includes(q) ||
        student.email?.toLowerCase().includes(q) ||
        student.school_name?.toLowerCase().includes(q);

      const classMatch = !classFilter || student.class === classFilter;

      return searchMatch && classMatch;
    });
  }, [students, search, classFilter]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (
      !form.roll_no.trim() ||
      !form.name.trim() ||
      !form.class.trim() ||
      !form.board.trim() ||
      !form.mode_of_education.trim() ||
      !form.phone.trim() ||
      !form.email.trim() ||
      !form.school_name.trim()
    ) {
      alert("Please fill all student details");
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
        roll_no: form.roll_no.trim().toUpperCase(),
        name: form.name.trim(),
        class: form.class.trim(),
        board: form.board.trim(),
        mode_of_education: form.mode_of_education.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        school_name: form.school_name.trim(),
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

      resetForm();
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
        mode_of_education: data.mode_of_education || "",
        phone: editPhone,
        email: data.email || "",
        school_name: data.school_name || "",
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

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
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
        <p className="text-gray-600">
          Add, edit and delete student details.
        </p>
        {facultyId && (
          <p className="text-sm text-gray-500">
            Logged in faculty: {facultyId}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-md p-5 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            {editingRollNo ? "Edit Student" : "Add Student"}
          </h2>

          {editingRollNo && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium"
            >
              Cancel Edit
            </button>
          )}
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
              placeholder="IA001"
              disabled={!!editingRollNo}
              className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
            />
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
            <input
              type="text"
              name="board"
              value={form.board}
              onChange={handleInputChange}
              placeholder="CBSE / State Board"
              className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mode of Education
            </label>
            <select
              name="mode_of_education"
              value={form.mode_of_education}
              onChange={handleInputChange}
              className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="">Select mode</option>
              <option value="Online">Online</option>
              <option value="Offline">Offline</option>
            </select>
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

      <div className="bg-white rounded-2xl shadow-md p-5 md:p-6">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-gray-800">Student List</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium"
            >
              Clear Filters
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[1400px] border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Class</th>
                <th className="text-left px-4 py-3">Board</th>
                <th className="text-left px-4 py-3">Mode of Education</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">School</th>
                <th className="text-left px-4 py-3">Total Fee</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student, index) => (
                  <tr
                    key={student.roll_no}
                    className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}
                  >
                    <td className="px-4 py-3 border-b">{student.name}</td>
                    <td className="px-4 py-3 border-b">{student.class}</td>
                    <td className="px-4 py-3 border-b">{student.board}</td>
                    <td className="px-4 py-3 border-b">
                      {student.mode_of_education || "-"}
                    </td>
                    <td className="px-4 py-3 border-b">{student.phone}</td>
                    <td className="px-4 py-3 border-b">{student.email}</td>
                    <td className="px-4 py-3 border-b">{student.school_name}</td>
                    <td className="px-4 py-3 border-b">{student.total_fee}</td>
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
                    colSpan="9"
                    className="text-center px-4 py-8 text-gray-500"
                  >
                    No students found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}