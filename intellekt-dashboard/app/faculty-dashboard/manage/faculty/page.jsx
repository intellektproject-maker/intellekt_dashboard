"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "http://192.168.1.20:5050";

const SUBJECT_OPTIONS = [
  { subject_id: "1", subject_name: "Admin" },
  { subject_id: "2", subject_name: "Mathematics correction" },
  { subject_id: "3", subject_name: "Physics correction" },
  { subject_id: "4", subject_name: "Software development" },
  { subject_id: "5", subject_name: "Media" },
  { subject_id: "6", subject_name: "Robotics" },
];

export default function ManageFacultyPage() {
  const searchParams = useSearchParams();
  const loggedInFacultyId = searchParams.get("id");

  const [facultyList, setFacultyList] = useState([]);
  const [subjects, setSubjects] = useState(SUBJECT_OPTIONS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    faculty_id: "",
    name: "",
    subject_id: "",
    phone: "",
    email: "",
    password: "",
  });

  const [editingFacultyId, setEditingFacultyId] = useState(null);
  const [touched, setTouched] = useState({
    faculty_id: false,
    name: false,
    subject_id: false,
    phone: false,
    email: false,
    password: false,
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      setLoading(true);

      const facultyRes = await fetch(`${API_BASE}/faculty`);
      const facultyData = await facultyRes.json();

      setFacultyList(Array.isArray(facultyData) ? facultyData : []);
      setSubjects(SUBJECT_OPTIONS);
    } catch (err) {
      console.error("Load error:", err);
      alert("Failed to load faculty data");
    } finally {
      setLoading(false);
    }
  }

  function getFieldError(fieldName) {
    const value = form[fieldName];

    if (fieldName === "faculty_id") {
      if (!value.trim()) return "Faculty ID is required";
      return "";
    }

    if (fieldName === "name") {
      if (!value.trim()) return "Faculty name is required";
      return "";
    }

    if (fieldName === "subject_id") {
      if (!value) return "Please select a subject";
      return "";
    }

    if (fieldName === "phone") {
      if (!value.trim()) return "Phone number is required";
      if (!/^[0-9]+$/.test(value)) return "Phone number must contain only digits";
      if (value.length !== 10) return "Phone number must be exactly 10 digits";
      return "";
    }

    if (fieldName === "email") {
      if (!value.trim()) return "Email is required";
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value.trim())) return "Please enter a valid email address";
      return "";
    }

    if (fieldName === "password") {
      if (!editingFacultyId && !value.trim()) return "Password is required";
      return "";
    }

    return "";
  }

  function markAllTouched() {
    setTouched({
      faculty_id: true,
      name: true,
      subject_id: true,
      phone: true,
      email: true,
      password: true,
    });
  }

  function hasValidationErrors() {
    const requiredFields = ["faculty_id", "name", "subject_id", "phone", "email"];

    if (!editingFacultyId) {
      requiredFields.push("password");
    }

    return requiredFields.some((field) => getFieldError(field));
  }

  function handleChange(e) {
    const { name, value } = e.target;

    if (name === "phone") {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);

      setForm((prev) => ({
        ...prev,
        phone: digitsOnly,
      }));

      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleBlur(e) {
    const { name } = e.target;
    setTouched((prev) => ({
      ...prev,
      [name]: true,
    }));
  }

  function resetForm() {
    setForm({
      faculty_id: "",
      name: "",
      subject_id: "",
      phone: "",
      email: "",
      password: "",
    });

    setTouched({
      faculty_id: false,
      name: false,
      subject_id: false,
      phone: false,
      email: false,
      password: false,
    });

    setEditingFacultyId(null);
  }

  const filteredFaculty = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return facultyList;

    return facultyList.filter((f) => {
      const subjectName =
        f.subject_name?.toLowerCase() ||
        subjects.find((s) => String(s.subject_id) === String(f.subject_id))
          ?.subject_name?.toLowerCase() ||
        "";

      return (
        f.faculty_id?.toLowerCase().includes(q) ||
        f.name?.toLowerCase().includes(q) ||
        f.phone?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        subjectName.includes(q)
      );
    });
  }, [facultyList, search, subjects]);

  async function handleSubmit(e) {
    e.preventDefault();
    markAllTouched();

    if (hasValidationErrors()) {
      alert("Please fill all required fields correctly");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        faculty_id: form.faculty_id.trim().toUpperCase(),
        name: form.name.trim(),
        subject_id: Number(form.subject_id),
        phone: form.phone.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
      };

      let res;

      if (editingFacultyId) {
        res = await fetch(`${API_BASE}/faculty/${editingFacultyId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/faculty`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to save faculty");
        return;
      }

      alert(
        editingFacultyId
          ? "Faculty updated successfully"
          : "Faculty added successfully"
      );
      resetForm();
      loadInitialData();
    } catch (err) {
      console.error("Save error:", err);
      alert("Something went wrong while saving faculty");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(faculty) {
    setEditingFacultyId(faculty.faculty_id);
    setForm({
      faculty_id: faculty.faculty_id || "",
      name: faculty.name || "",
      subject_id: faculty.subject_id ? String(faculty.subject_id) : "",
      phone: faculty.phone || "",
      email: faculty.email || "",
      password: "",
    });

    setTouched({
      faculty_id: false,
      name: false,
      subject_id: false,
      phone: false,
      email: false,
      password: false,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleDelete(facultyIdToDelete) {
    if (!facultyIdToDelete) return;

    if (facultyIdToDelete === loggedInFacultyId) {
      alert("You cannot delete the currently logged in faculty");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete faculty ${facultyIdToDelete}?`
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/faculty/${facultyIdToDelete}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to delete faculty");
        return;
      }

      alert("Faculty deleted successfully");
      loadInitialData();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Something went wrong while deleting faculty");
    }
  }

  function getSubjectName(subjectId) {
    const subject = subjects.find(
      (s) => String(s.subject_id) === String(subjectId)
    );
    return subject?.subject_name || `Subject ${subjectId}`;
  }

  function getInputClass(fieldName) {
    const hasError = touched[fieldName] && getFieldError(fieldName);

    return `w-full rounded-lg px-4 py-3 outline-none focus:ring-2 ${
      hasError
        ? "border-2 border-red-500 bg-red-50 focus:ring-red-300"
        : "border focus:ring-blue-400"
    }`;
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-gray-600 text-lg">Loading faculty management...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-blue-700">
          Faculty Management
        </h1>
        <p className="text-gray-600 mt-2">
          Add, edit and delete faculty details.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-5 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            {editingFacultyId ? "Edit Faculty" : "Add Faculty"}
          </h2>

          {editingFacultyId && (
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
              Faculty ID
            </label>
            <input
              type="text"
              name="faculty_id"
              value={form.faculty_id}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="IG001"
              disabled={!!editingFacultyId}
              className={`${getInputClass("faculty_id")} disabled:bg-gray-100`}
            />
            {touched.faculty_id && getFieldError("faculty_id") && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError("faculty_id")}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Faculty Name
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Enter faculty name"
              className={getInputClass("name")}
            />
            {touched.name && getFieldError("name") && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError("name")}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <select
              name="subject_id"
              value={form.subject_id}
              onChange={handleChange}
              onBlur={handleBlur}
              className={getInputClass("subject_id")}
            >
              <option value="">Select subject</option>
              {subjects.map((subject) => (
                <option key={subject.subject_id} value={subject.subject_id}>
                  {subject.subject_name}
                </option>
              ))}
            </select>
            {touched.subject_id && getFieldError("subject_id") && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError("subject_id")}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="text"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Enter 10 digit phone number"
              maxLength={10}
              inputMode="numeric"
              className={getInputClass("phone")}
            />
            {touched.phone && getFieldError("phone") && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError("phone")}
              </p>
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
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Enter email"
              className={getInputClass("email")}
            />
            {touched.email && getFieldError("email") && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError("email")}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {editingFacultyId ? "New Password (optional)" : "Password"}
            </label>
            <input
              type="text"
              name="password"
              value={form.password}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder={
                editingFacultyId
                  ? "Leave empty to keep current password"
                  : "Enter password"
              }
              className={getInputClass("password")}
            />
            {touched.password && getFieldError("password") && (
              <p className="text-red-600 text-sm mt-1">
                {getFieldError("password")}
              </p>
            )}
          </div>

          <div className="md:col-span-2 flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-60"
            >
              {saving
                ? editingFacultyId
                  ? "Updating..."
                  : "Saving..."
                : editingFacultyId
                ? "Update Faculty"
                : "Add Faculty"}
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
        <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Faculty List</h2>

          <input
            type="text"
            placeholder="Search by faculty id, name, phone, email or subject"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-96 border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th className="text-left px-4 py-3">Faculty ID</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Subject</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Password</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredFaculty.length > 0 ? (
                filteredFaculty.map((faculty, index) => (
                  <tr
                    key={faculty.faculty_id}
                    className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}
                  >
                    <td className="px-4 py-3 border-b">{faculty.faculty_id}</td>
                    <td className="px-4 py-3 border-b">{faculty.name}</td>
                    <td className="px-4 py-3 border-b">
                      {faculty.subject_name || getSubjectName(faculty.subject_id)}
                    </td>
                    <td className="px-4 py-3 border-b">{faculty.phone}</td>
                    <td className="px-4 py-3 border-b">{faculty.email}</td>
                    <td className="px-4 py-3 border-b">{faculty.password}</td>
                    <td className="px-4 py-3 border-b">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(faculty)}
                          className="bg-yellow-400 hover:bg-yellow-500 text-black px-4 py-2 rounded-lg font-medium"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(faculty.faculty_id)}
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
                    colSpan="7"
                    className="text-center px-4 py-8 text-gray-500"
                  >
                    No faculty found
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