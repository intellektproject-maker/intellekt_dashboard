"use client";

import { Suspense, useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://responsible-wonder-production.up.railway.app";

function SyllabusPageInner() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [syllabus, setSyllabus] = useState([]);

  const [className, setClassName] = useState("");
  const [board, setBoard] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterNo, setChapterNo] = useState("");
  const [chapterName, setChapterName] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [searchText, setSearchText] = useState("");

  // ------------------------------------------------------------
  // LOAD CLASSES
  // ------------------------------------------------------------

  async function loadClasses() {
    try {
      const res = await fetch(`${API_BASE}/classes`, {
        cache: "no-store",
      });

      const data = await res.json();

      setClasses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Classes fetch failed:", err);
      setClasses([]);
    }
  }

  // ------------------------------------------------------------
  // LOAD SUBJECTS
  // ------------------------------------------------------------

  async function loadSubjects() {
    try {
      const res = await fetch(`${API_BASE}/subjects`, {
        cache: "no-store",
      });

      const data = await res.json();

      setSubjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Subjects fetch failed:", err);
      setSubjects([]);
    }
  }

  // ------------------------------------------------------------
  // LOAD SYLLABUS
  // ------------------------------------------------------------

  async function loadSyllabus() {
    try {
      const res = await fetch(`${API_BASE}/syllabus`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Syllabus API error:", data);
        setSyllabus([]);
        return;
      }

      setSyllabus(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Syllabus fetch failed:", err);
      setSyllabus([]);
    }
  }

  useEffect(() => {
    loadClasses();
    loadSubjects();
    loadSyllabus();
  }, []);

  // ------------------------------------------------------------
  // CLASS / BOARD
  // ------------------------------------------------------------

  function handleClassChange(e) {
    const value = e.target.value;

    if (!value) {
      setClassName("");
      setBoard("");
      return;
    }

    const [cls, brd] = value.split("||");

    setClassName(cls || "");
    setBoard(brd || "");
  }

  // ------------------------------------------------------------
  // RESET FORM
  // ------------------------------------------------------------

  function resetForm() {
    setClassName("");
    setBoard("");
    setSubjectId("");
    setChapterNo("");
    setChapterName("");
    setEditingId(null);
  }

  // ------------------------------------------------------------
  // VALIDATION
  // ------------------------------------------------------------

  function validateForm() {
    if (!className) {
      alert("Select class");
      return false;
    }

    if (!board) {
      alert("Select board");
      return false;
    }

    if (!subjectId) {
      alert("Select subject");
      return false;
    }

    if (!chapterNo || Number(chapterNo) <= 0) {
      alert("Enter a valid chapter number");
      return false;
    }

    if (!chapterName.trim()) {
      alert("Enter chapter name");
      return false;
    }

    return true;
  }

  // ------------------------------------------------------------
  // SAVE / UPDATE
  // ------------------------------------------------------------

  async function saveSyllabus() {
    if (saving) return;

    if (!validateForm()) return;

    try {
      setSaving(true);

      const url = editingId
        ? `${API_BASE}/syllabus/${editingId}`
        : `${API_BASE}/syllabus`;

      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          class: className.trim(),
          board: board.trim(),
          subject_id: Number(subjectId),
          chapter_no: Number(chapterNo),
          chapter_name: chapterName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(
          data.error ||
            data.details ||
            "Failed to save syllabus"
        );
        return;
      }

      alert(
        editingId
          ? "Syllabus chapter updated successfully"
          : "Syllabus chapter added successfully"
      );

      resetForm();

      await loadSyllabus();
    } catch (err) {
      console.error("Save syllabus error:", err);
      alert("Something went wrong while saving syllabus");
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------
  // EDIT
  // ------------------------------------------------------------

  function editSyllabus(item) {
    setEditingId(item.syllabus_id);

    setClassName(item.class || "");
    setBoard(item.board || "");
    setSubjectId(String(item.subject_id || ""));
    setChapterNo(String(item.chapter_no || ""));
    setChapterName(item.chapter_name || "");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ------------------------------------------------------------
  // DELETE
  // ------------------------------------------------------------

  async function deleteSyllabus(item) {
    const confirmed = window.confirm(
      `Delete Chapter ${item.chapter_no} - ${item.chapter_name}?`
    );

    if (!confirmed) return;

    try {
      const res = await fetch(
        `${API_BASE}/syllabus/${item.syllabus_id}`,
        {
          method: "DELETE",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Delete failed");
        return;
      }

      alert("Syllabus chapter deleted successfully");

      if (editingId === item.syllabus_id) {
        resetForm();
      }

      await loadSyllabus();
    } catch (err) {
      console.error("Delete syllabus error:", err);
      alert("Delete failed");
    }
  }

  // ------------------------------------------------------------
  // SUBJECT NAME
  // ------------------------------------------------------------

  function getSubjectName(subjectIdValue) {
    const subject = subjects.find(
      (s) => Number(s.subject_id) === Number(subjectIdValue)
    );

    return subject?.subject_name || "-";
  }

  // ------------------------------------------------------------
  // FILTER
  // ------------------------------------------------------------

  const filteredSyllabus = [...syllabus]
    .sort((a, b) => {
      const classCompare = String(a.class || "").localeCompare(
        String(b.class || ""),
        undefined,
        { numeric: true }
      );

      if (classCompare !== 0) {
        return classCompare;
      }

      const boardCompare = String(a.board || "").localeCompare(
        String(b.board || "")
      );

      if (boardCompare !== 0) {
        return boardCompare;
      }

      const subjectCompare =
        Number(a.subject_id || 0) -
        Number(b.subject_id || 0);

      if (subjectCompare !== 0) {
        return subjectCompare;
      }

      return (
        Number(a.chapter_no || 0) -
        Number(b.chapter_no || 0)
      );
    })
    .filter((item) => {
      const search = searchText.toLowerCase().trim();

      if (!search) return true;

      return (
        String(item.class || "")
          .toLowerCase()
          .includes(search) ||
        String(item.board || "")
          .toLowerCase()
          .includes(search) ||
        String(getSubjectName(item.subject_id))
          .toLowerCase()
          .includes(search) ||
        String(item.chapter_no || "")
          .toLowerCase()
          .includes(search) ||
        String(item.chapter_name || "")
          .toLowerCase()
          .includes(search)
      );
    });

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------

  return (
    <div className="p-6 md:p-10 bg-gray-50 min-h-screen">

      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Syllabus Management
      </h1>

      {/* ======================================================
          ADD / EDIT FORM
          ====================================================== */}

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-8">

        <h2 className="text-xl md:text-2xl font-bold text-blue-800 mb-6">
          {editingId
            ? "Edit Syllabus Chapter"
            : "Add Syllabus Chapter"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* CLASS + BOARD */}

          <select
            value={
              className
                ? `${className}||${board}`
                : ""
            }
            onChange={handleClassChange}
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
          >
            <option value="">
              Select Class
            </option>

            {classes.map((c, index) => (
              <option
                key={`${c.class}-${c.board}-${index}`}
                value={`${c.class}||${c.board}`}
              >
                {c.class} — {c.board}
              </option>
            ))}
          </select>

          {/* BOARD */}

          <input
            placeholder="Board"
            value={board}
            readOnly
            className="border rounded-lg px-4 py-3 bg-gray-100 text-gray-700"
          />

          {/* SUBJECT */}

          <select
            value={subjectId}
            onChange={(e) =>
              setSubjectId(e.target.value)
            }
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
          >
            <option value="">
              Select Subject
            </option>

            {subjects.map((subject) => (
              <option
                key={subject.subject_id}
                value={subject.subject_id}
              >
                {subject.subject_name}
              </option>
            ))}
          </select>

          {/* CHAPTER NUMBER */}

          <input
            type="number"
            min="1"
            placeholder="Chapter Number"
            value={chapterNo}
            onChange={(e) => {
              const value = e.target.value;

              if (
                value === "" ||
                /^\d+$/.test(value)
              ) {
                setChapterNo(value);
              }
            }}
            className="border rounded-lg px-4 py-3 text-gray-700"
          />

          {/* CHAPTER NAME */}

          <input
            placeholder="Chapter Name"
            value={chapterName}
            onChange={(e) =>
              setChapterName(e.target.value)
            }
            className="border rounded-lg px-4 py-3 text-gray-700 md:col-span-2"
          />
        </div>

        {/* BUTTONS */}

        <div className="mt-6 flex gap-3">

          <button
            type="button"
            onClick={saveSyllabus}
            disabled={saving}
            className="flex-1 bg-blue-700 text-white py-3 rounded-lg hover:bg-blue-800 disabled:bg-gray-400 font-semibold"
          >
            {saving
              ? "Saving..."
              : editingId
              ? "Update Chapter"
              : "Add Chapter"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="px-6 bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600 disabled:bg-gray-400 font-semibold"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ======================================================
          EXISTING SYLLABUS
          ====================================================== */}

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">

          <h2 className="text-xl md:text-2xl font-bold text-blue-800">
            Existing Syllabus
          </h2>

          <input
            type="text"
            placeholder="Search syllabus..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
            }}
            className="border rounded-lg px-4 py-3 text-gray-700 w-full md:w-80"
          />
        </div>

        <div className="overflow-x-auto">

          <table className="min-w-full border-collapse">

            <thead>
              <tr className="bg-blue-700 text-white">

                <th className="p-3 text-left">
                  Class
                </th>

                <th className="p-3 text-left">
                  Board
                </th>

                <th className="p-3 text-left">
                  Subject
                </th>

                <th className="p-3 text-left">
                  Chapter
                </th>

                <th className="p-3 text-left">
                  Chapter Name
                </th>

                <th className="p-3 text-left">
                  Action
                </th>

              </tr>
            </thead>

            <tbody>

              {filteredSyllabus.map((item) => (

                <tr
                  key={item.syllabus_id}
                  className="border-b hover:bg-gray-50"
                >

                  <td className="p-3">
                    {item.class || "-"}
                  </td>

                  <td className="p-3">
                    {item.board || "-"}
                  </td>

                  <td className="p-3">
                    {getSubjectName(
                      item.subject_id
                    )}
                  </td>

                  <td className="p-3 font-semibold">
                    {item.chapter_no}
                  </td>

                  <td className="p-3">
                    {item.chapter_name}
                  </td>

                  <td className="p-3">

                    <div className="flex gap-2">

                      <button
                        type="button"
                        onClick={() =>
                          editSyllabus(item)
                        }
                        className="bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          deleteSyllabus(item)
                        }
                        className="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700"
                      >
                        Delete
                      </button>

                    </div>

                  </td>

                </tr>

              ))}

              {filteredSyllabus.length === 0 && (

                <tr>

                  <td
                    colSpan="6"
                    className="p-5 text-center text-gray-500"
                  >
                    No syllabus records found
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

export default function SyllabusPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          Loading...
        </div>
      }
    >
      <SyllabusPageInner />
    </Suspense>
  );
}