"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://responsible-wonder-production.up.railway.app";

const ITEMS_PER_PAGE = 10;

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function ManageFacultyContent() {
  const searchParams = useSearchParams();
  const loggedInFacultyId = searchParams.get("id");

  const [facultyList, setFacultyList] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showEditPopup, setShowEditPopup] = useState(false);

  const [form, setForm] = useState({
    faculty_id: "",
    name: "",
    role_id: "",
    phone: "",
    email: "",
    password: "",
    employment_type: "",
    date_of_joining: "",
  });

  const [editForm, setEditForm] = useState({
    faculty_id: "",
    name: "",
    role_id: "",
    phone: "",
    email: "",
    password: "",
    employment_type: "",
    date_of_joining: "",
  });

  const [editingFacultyId, setEditingFacultyId] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!loading && !editingFacultyId) {
      generateNextFacultyId(facultyList);
    }
  }, [facultyList, loading, editingFacultyId]);

  function generateNextFacultyId(list) {
    const maxNumber = list.reduce((max, faculty) => {
      const match = String(faculty.faculty_id || "").match(/^IG(\d+)$/i);
      if (!match) return max;
      return Math.max(max, Number(match[1]));
    }, 0);

    const nextNumber = maxNumber + 1;
    const nextId = `IG${String(nextNumber).padStart(3, "0")}`;

    setForm((prev) => ({
      ...prev,
      faculty_id: nextId,
      password: prev.password || nextId,
    }));
  }

  async function loadInitialData() {
    try {
      setLoading(true);

      const [facultyRes, rolesRes] = await Promise.all([
        fetch(`${API_BASE}/faculty`, { cache: "no-store" }),
        fetch(`${API_BASE}/faculty-roles`, { cache: "no-store" }),
      ]);

      if (!facultyRes.ok) throw new Error("Failed to fetch faculty");
      if (!rolesRes.ok) throw new Error("Failed to fetch faculty roles");

      const facultyData = await facultyRes.json();
      const rolesData = await rolesRes.json();

      setFacultyList(Array.isArray(facultyData) ? facultyData : []);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
    } catch (err) {
      console.error("Load faculty error:", err);
      alert("Failed to load faculty data");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    const maxNumber = facultyList.reduce((max, faculty) => {
      const match = String(faculty.faculty_id || "").match(/^IG(\d+)$/i);
      if (!match) return max;
      return Math.max(max, Number(match[1]));
    }, 0);

    const nextId = `IG${String(maxNumber + 1).padStart(3, "0")}`;

    setForm({
      faculty_id: nextId,
      name: "",
      role_id: "",
      phone: "",
      email: "",
      password: nextId,
      employment_type: "",
      date_of_joining: "",
    });
  }

  function handleChange(e, type = "add") {
    const { name, value } = e.target;

    const setter = type === "edit" ? setEditForm : setForm;

    if (name === "phone") {
      setter((prev) => ({
        ...prev,
        phone: value.replace(/\D/g, "").slice(0, 10),
      }));
      return;
    }

    setter((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function validateForm(data, isEdit = false) {
    if (!data.faculty_id.trim()) return "Faculty ID is required";
    if (!data.name.trim()) return "Faculty name is required";
    if (!data.role_id) return "Subject / Role is required";
    if (!data.phone.trim()) return "Phone number is required";
    if (data.phone.length !== 10) return "Phone number must be 10 digits";
    if (!data.email.trim()) return "Email is required";
    if (!data.employment_type) return "Employment type is required";
    if (!data.date_of_joining) return "Date of joining is required";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email.trim())) {
      return "Enter a valid email address";
    }

    if (!isEdit && !data.password.trim()) {
      return "Password is required";
    }

    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const error = validateForm(form, false);
    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const payload = {
        faculty_id: form.faculty_id.trim().toUpperCase(),
        name: form.name.trim(),
        role_id: Number(form.role_id),
        phone: form.phone.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        employment_type: form.employment_type,
        date_of_joining: form.date_of_joining,
      };

      const res = await fetch(`${API_BASE}/faculty`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to add faculty");
        return;
      }

      alert("Faculty added successfully");
      await loadInitialData();
      resetForm();
    } catch (err) {
      console.error("Save faculty error:", err);
      alert("Something went wrong while saving faculty");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(faculty) {
    setEditingFacultyId(faculty.faculty_id);

    setEditForm({
      faculty_id: faculty.faculty_id || "",
      name: faculty.name || "",
      role_id: faculty.role_id ? String(faculty.role_id) : "",
      phone: faculty.phone || "",
      email: faculty.email || "",
      password: "",
      employment_type: faculty.employment_type || "",
      date_of_joining: faculty.date_of_joining
        ? String(faculty.date_of_joining).slice(0, 10)
        : "",
    });

    setShowEditPopup(true);
  }

  async function handleUpdate(e) {
    e.preventDefault();

    const error = validateForm(editForm, true);
    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const payload = {
        faculty_id: editForm.faculty_id.trim().toUpperCase(),
        name: editForm.name.trim(),
        role_id: Number(editForm.role_id),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        password: editForm.password.trim(),
        employment_type: editForm.employment_type,
        date_of_joining: editForm.date_of_joining,
      };

      const res = await fetch(`${API_BASE}/faculty/${editingFacultyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to update faculty");
        return;
      }

      alert("Faculty updated successfully");
      setShowEditPopup(false);
      setEditingFacultyId(null);
      await loadInitialData();
    } catch (err) {
      console.error("Update faculty error:", err);
      alert("Something went wrong while updating faculty");
    } finally {
      setSaving(false);
    }
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
      await loadInitialData();
    } catch (err) {
      console.error("Delete faculty error:", err);
      alert("Something went wrong while deleting faculty");
    }
  }

  function getRoleName(roleId, fallbackRoleName = "") {
    if (fallbackRoleName) return fallbackRoleName;

    const role = roles.find((r) => String(r.role_id) === String(roleId));
    return role?.role_name || "-";
  }

  const filteredFaculty = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return facultyList;

    return facultyList.filter((f) => {
      const roleName = getRoleName(f.role_id, f.role_name).toLowerCase();

      return (
        f.faculty_id?.toLowerCase().includes(q) ||
        f.name?.toLowerCase().includes(q) ||
        f.phone?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        f.employment_type?.toLowerCase().includes(q) ||
        roleName.includes(q)
      );
    });
  }, [facultyList, search, roles]);

  const totalPages = Math.ceil(filteredFaculty.length / ITEMS_PER_PAGE) || 1;

  const paginatedFaculty = filteredFaculty.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

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
        <h2 className="text-lg font-semibold text-blue-700">Add Faculty</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Faculty ID">
            <input
              name="faculty_id"
              value={form.faculty_id}
              disabled
              placeholder="Faculty ID"
              className="w-full border rounded-lg px-4 py-3 bg-gray-100 cursor-not-allowed"
            />
          </Field>

          <Field label="Faculty Name">
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Faculty Name"
              className="w-full border rounded-lg px-4 py-3"
            />
          </Field>

          <Field label="Subject / Role">
            <select
              name="role_id"
              value={form.role_id}
              onChange={handleChange}
              className="w-full border rounded-lg px-4 py-3"
            >
              <option value="">Select Subject / Role</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {role.role_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Phone Number">
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="Phone Number"
              className="w-full border rounded-lg px-4 py-3"
            />
          </Field>

          <Field label="Email">
            <input
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Email"
              className="w-full border rounded-lg px-4 py-3"
            />
          </Field>

          <Field label="Password">
            <input
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Password"
              className="w-full border rounded-lg px-4 py-3"
            />
          </Field>

          <Field label="Employment Type">
            <select
              name="employment_type"
              value={form.employment_type}
              onChange={handleChange}
              className="w-full border rounded-lg px-4 py-3"
            >
              <option value="">Select Employment Type</option>
              <option value="Part Time">Part Time</option>
              <option value="Full Time">Full Time</option>
            </select>
          </Field>

          <Field label="Date of Joining">
            <input
              type="date"
              name="date_of_joining"
              value={form.date_of_joining}
              onChange={handleChange}
              className="w-full border rounded-lg px-4 py-3"
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold"
        >
          {saving ? "Saving..." : "Add Faculty"}
        </button>
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
                <th className="p-3 text-left">Employment</th>
                <th className="p-3 text-left">Date of Joining</th>
                <th className="p-3 text-left">Phone</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              {paginatedFaculty.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-4 text-center text-gray-500">
                    No faculty found
                  </td>
                </tr>
              ) : (
                paginatedFaculty.map((faculty) => (
                  <tr
                    key={faculty.faculty_id}
                    className="border-b hover:bg-gray-50"
                  >
                    <td className="p-3 font-semibold">{faculty.faculty_id}</td>
                    <td className="p-3">{faculty.name}</td>
                    <td className="p-3">
                      {getRoleName(faculty.role_id, faculty.role_name)}
                    </td>
                    <td className="p-3">{faculty.employment_type || "-"}</td>
                    <td className="p-3">
                      {faculty.date_of_joining
                        ? String(faculty.date_of_joining).slice(0, 10)
                        : "-"}
                    </td>
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

        <div className="flex justify-between items-center mt-5">
          <p className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg bg-gray-200 disabled:opacity-50"
            >
              Previous
            </button>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showEditPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleUpdate}
            className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 w-full max-w-4xl space-y-5"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-blue-700">
                Edit Faculty
              </h2>

              <button
                type="button"
                onClick={() => {
                  setShowEditPopup(false);
                  setEditingFacultyId(null);
                }}
                className="text-gray-600 hover:text-red-600 text-xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Faculty ID">
                <input
                  name="faculty_id"
                  value={editForm.faculty_id}
                  disabled
                  className="w-full border rounded-lg px-4 py-3 bg-gray-100 cursor-not-allowed"
                />
              </Field>

              <Field label="Faculty Name">
                <input
                  name="name"
                  value={editForm.name}
                  onChange={(e) => handleChange(e, "edit")}
                  className="w-full border rounded-lg px-4 py-3"
                />
              </Field>

              <Field label="Subject / Role">
                <select
                  name="role_id"
                  value={editForm.role_id}
                  onChange={(e) => handleChange(e, "edit")}
                  className="w-full border rounded-lg px-4 py-3"
                >
                  <option value="">Select Subject / Role</option>
                  {roles.map((role) => (
                    <option key={role.role_id} value={role.role_id}>
                      {role.role_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Phone Number">
                <input
                  name="phone"
                  value={editForm.phone}
                  onChange={(e) => handleChange(e, "edit")}
                  className="w-full border rounded-lg px-4 py-3"
                />
              </Field>

              <Field label="Email">
                <input
                  name="email"
                  value={editForm.email}
                  onChange={(e) => handleChange(e, "edit")}
                  className="w-full border rounded-lg px-4 py-3"
                />
              </Field>

              <Field label="New Password Optional">
                <input
                  name="password"
                  value={editForm.password}
                  onChange={(e) => handleChange(e, "edit")}
                  placeholder="Leave empty to keep old password"
                  className="w-full border rounded-lg px-4 py-3"
                />
              </Field>

              <Field label="Employment Type">
                <select
                  name="employment_type"
                  value={editForm.employment_type}
                  onChange={(e) => handleChange(e, "edit")}
                  className="w-full border rounded-lg px-4 py-3"
                >
                  <option value="">Select Employment Type</option>
                  <option value="Part Time">Part Time</option>
                  <option value="Full Time">Full Time</option>
                </select>
              </Field>

              <Field label="Date of Joining">
                <input
                  type="date"
                  name="date_of_joining"
                  value={editForm.date_of_joining}
                  onChange={(e) => handleChange(e, "edit")}
                  className="w-full border rounded-lg px-4 py-3"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowEditPopup(false);
                  setEditingFacultyId(null);
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold"
              >
                {saving ? "Updating..." : "Update Faculty"}
              </button>
            </div>
          </form>
        </div>
      )}
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