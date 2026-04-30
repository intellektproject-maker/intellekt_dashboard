"use client";

import { Suspense } from "react";
import { useEffect, useMemo, useState } from "react";
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

    window.scrollTo({ top: 0, behavior: "smooth" });
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
    // 👇 YOUR ORIGINAL UI — NOT TOUCHED
    <div className="p-4 md:p-8 space-y-8">
      {/* (rest of your JSX unchanged — keep exactly as in your file) */}
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