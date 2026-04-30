"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://responsible-wonder-production.up.railway.app";

const SUBJECT_OPTIONS = [
  { subject_id: "1", subject_name: "Admin" },
  { subject_id: "2", subject_name: "Mathematics correction" },
  { subject_id: "3", subject_name: "Physics correction" },
  { subject_id: "4", subject_name: "Software development" },
  { subject_id: "5", subject_name: "Media" },
  { subject_id: "6", subject_name: "Robotics" },
];

function ManageFacultyContent() {
  const searchParams = useSearchParams();
  const loggedInFacultyId = searchParams.get("id");

  const [facultyList, setFacultyList] = useState([]);
  const [subjects] = useState(SUBJECT_OPTIONS);
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

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/faculty`, { cache: "no-store" });

      if (!res.ok) {
        throw new Error("Failed to fetch faculty");
      }

      const data = await res.json();
      setFacultyList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Load faculty error:", err);
      alert("Failed to load faculty data");
    } finally {
      setLoading(false);
    }
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
    setEditingFacultyId(null);
  }

  function handleChange(e) {
    const { name, value } = e.target;

    if (name === "phone") {
      setForm((prev) => ({
        ...prev,
        phone: value.replace(/\D/g, "").slice(0, 10),
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function validateForm() {
    if (!form.faculty_id.trim()) return "Faculty ID is required";
    if (!form.name.trim()) return "Faculty name is required";
    if (!form.subject_id) return "Subject is required";
    if (!form.phone.trim()) return "Phone number is required";
    if (form.phone.length !== 10) return "Phone number must be 10 digits";
    if (!form.email.trim()) return "Email is required";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) {
      return "Enter a valid email address";
    }

    if (!editingFacultyId && !form.password.trim()) {
      return "Password is required";
    }

    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const error = validateForm();
    if (error) {
      alert(error);
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

      const url = editingFacultyId
        ? `${API_BASE}/faculty/${editingFacultyId}`
        : `${API_BASE}/faculty`;

      const method = editingFacultyId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to save faculty");
        return;
      }

      alert(editingFacultyId ? "Faculty updated successfully" : "Faculty added successfully");
      resetForm();
      loadInitialData();
    } catch (err) {
      console.error("Save faculty error:", err);
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

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(facultyId) {
    if (!facultyId) return;

    if (facultyId === loggedInFacultyId) {
      alert("You cannot delete the currently logged-in faculty");
      return;
    }

    const confirmed = window.confirm(`Delete faculty ${facultyId}?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/faculty/${facultyId}`, {
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
      console.error("Delete faculty error:", err);
      alert("Something went wrong while deleting faculty");
    }
  }

  function getSubjectName(subjectId) {
    const subject = subjects.find(
      (s) => String(s.subject_id) === String(subjectId)
    );
    return subject?.subject_name || "-";
  }

  const filteredFaculty = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return facultyList;

    return facultyList.filter((f) => {
      const subjectName = getSubjectName(f.subject_id).toLowerCase();

      return (
        f.faculty_id?.toLowerCase().includes(q) ||
        f.name?.toLowerCase().includes(q) ||
        f.phone?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        subjectName.includes(q)
      );
    });
  }, [facultyList, search]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600 text-lg">Loading faculty management...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 bg-gray-100 min-h-screen">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-2">
          Manage Faculty
        </h1>
        <p className="text-gray-600">
          Add, edit, delete and search faculty members.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-md rounded-xl border border-gray-200 p-6 space-y-5"
      >
        <h2 className="text-lg font-semibold text-blue-700">
          {editingFacultyId ? "Edit Faculty" : "Add Faculty"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="faculty_id"
            value={form.faculty_id}
            onChange={handleChange}
            disabled={!!editingFacultyId}
            placeholder="Faculty ID"
            className="w-full border rounded-lg px-4 py-3"
          />

          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Faculty Name"
            className="w-full border rounded-lg px-4 py-3"
          />

          <select
            name="subject_id"
            value={form.subject_id}
            onChange={handleChange}
            className="w-full border rounded-lg px-4 py-3"
          >
            <option value="">Select Subject / Role</option>
            {subjects.map((subject) => (
              <option key={subject.subject_id} value={subject.subject_id}>
                {subject.subject_name}
              </option>
            ))}
          </select>

          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="Phone Number"
            className="w-full border rounded-lg px-4 py-3"
          />

          <input
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Email"
            className="w-full border rounded-lg px-4 py-3"
          />

          <input
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder={editingFacultyId ? "New Password optional" : "Password"}
            className="w-full border rounded-lg px-4 py-3"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold"
          >
            {saving ? "Saving..." : editingFacultyId ? "Update Faculty" : "Add Faculty"}
          </button>

          {editingFacultyId && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
          <h2 className="text-lg font-semibold text-blue-700">
            Faculty List
          </h2>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search faculty..."
            className="w-full md:w-80 border rounded-lg px-4 py-3"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th className="p-3 text-left">Faculty ID</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Subject / Role</th>
                <th className="p-3 text-left">Phone</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredFaculty.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-4 text-center text-gray-500">
                    No faculty found
                  </td>
                </tr>
              ) : (
                filteredFaculty.map((faculty) => (
                  <tr key={faculty.faculty_id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-semibold">{faculty.faculty_id}</td>
                    <td className="p-3">{faculty.name}</td>
                    <td className="p-3">{getSubjectName(faculty.subject_id)}</td>
                    <td className="p-3">{faculty.phone}</td>
                    <td className="p-3">{faculty.email}</td>
                    <td className="p-3">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleEdit(faculty)}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-lg"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleDelete(faculty.faculty_id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ManageFacultyPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <ManageFacultyContent />
    </Suspense>
  );
}