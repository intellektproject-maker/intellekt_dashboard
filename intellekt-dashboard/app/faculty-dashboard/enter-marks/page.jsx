"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://responsible-wonder-production.up.railway.app";

function MarksPageContent() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id");

  const [classBoard, setClassBoard] = useState("");
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [comments, setComments] = useState({});
  const [testCode, setTestCode] = useState("");

  const [autoTotal, setAutoTotal] = useState(null);
  const [manualTotal, setManualTotal] = useState("");

  const [errors, setErrors] = useState({});
  const [testCodeError, setTestCodeError] = useState("");
  const [classError, setClassError] = useState("");
  const [totalError, setTotalError] = useState("");

  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  const totalMarks = manualTotal ? Number(manualTotal) : autoTotal;

  useEffect(() => {
    async function loadClasses() {
      try {
        const res = await fetch(`${API_BASE}/classes`);
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error loading classes:", err);
        setClasses([]);
      } finally {
        setLoadingClasses(false);
      }
    }
    loadClasses();
  }, []);

  function parseTestCode(code) {
    if (!code) return null;

    const upper = code.toUpperCase().trim();
    const match = upper.match(/^([CSI]B?)(\d{2})([MP])(\d+)C(\d+)$/);

    if (!match) return null;

    const boardPrefix = match[1];
    const classNum = match[2];
    const totalMarks = Number(match[4]);

    let boardName = null;

    if (boardPrefix === "C") boardName = "CBSE";
    else if (boardPrefix === "S" || boardPrefix === "SB")
      boardName = "State Board";
    else if (boardPrefix === "I") boardName = "ICSE";

    if (!boardName) return null;

    return { boardName, classNum, totalMarks };
  }

  function findMatchingClass(parsed) {
    if (!parsed) return null;

    return classes.find((c) => {
      const cls = String(c.class || "").toUpperCase();
      const brd = String(c.board || "").toUpperCase();

      return cls.includes(parsed.classNum) &&
        brd === parsed.boardName.toUpperCase();
    });
  }

  function handleTestCode(value) {
    setTestCode(value);

    const parsed = parseTestCode(value);

    if (parsed) {
      setAutoTotal(parsed.totalMarks);
      setManualTotal("");
      setTestCodeError("");
      setTotalError("");

      const matched = findMatchingClass(parsed);

      if (matched) {
        setClassBoard(matched.class);
        setClassError("");
      } else {
        setClassBoard("");
      }
    } else {
      setAutoTotal(null);
      setClassBoard("");

      if (value.length > 3) {
        setTestCodeError("Invalid test code format");
      } else {
        setTestCodeError("");
      }
    }
  }

  function generateComment(mark) {
    if (!totalMarks && totalMarks !== 0) return "";

    const percentage = (Number(mark) / Number(totalMarks)) * 100;

    if (percentage >= 90) return "Excellent";
    if (percentage >= 75) return "Very Good";
    if (percentage >= 60) return "Good";
    if (percentage >= 40) return "Average";
    return "Needs Improvement";
  }

  async function loadStudents() {
    let hasError = false;

    if (!classBoard) {
      setClassError("Select class");
      hasError = true;
    } else setClassError("");

    if (!totalMarks) {
      setTotalError("Enter total marks");
      hasError = true;
    } else setTotalError("");

    if (!testCode.trim()) {
      setTestCodeError("Enter test code");
      hasError = true;
    }

    if (hasError) return;

    try {
      const res = await fetch(`${API_BASE}/students/${classBoard}`);
      const data = await res.json();

      setStudents(Array.isArray(data) ? data : []);
      setMarks({});
      setComments({});
      setErrors({});
    } catch (err) {
      console.error("Error loading students:", err);
      alert("Students loading failed");
    }
  }

  function handleMarks(roll, value) {
    if (value === "") {
      setMarks((p) => ({ ...p, [roll]: "" }));
      setComments((p) => ({ ...p, [roll]: "" }));
      setErrors((p) => ({ ...p, [roll]: "Required" }));
      return;
    }

    let clean = value.replace(/\D/g, "").replace(/^0+/, "");
    if (clean === "") clean = "0";

    const num = Number(clean);

    if (num > totalMarks) {
      setErrors((p) => ({ ...p, [roll]: `Max ${totalMarks}` }));
      return;
    }

    setMarks((p) => ({ ...p, [roll]: num }));
    setErrors((p) => ({ ...p, [roll]: "" }));
    setComments((p) => ({ ...p, [roll]: generateComment(num) }));
  }

  async function submitMarks() {
    const newErrors = {};
    let hasError = false;

    students.forEach((s) => {
      if (marks[s.roll_no] === "" || marks[s.roll_no] === undefined) {
        newErrors[s.roll_no] = "Required";
        hasError = true;
      }
    });

    setErrors(newErrors);

    if (hasError) {
      alert("Please enter marks for all students");
      return;
    }

    const payload = students.map((s) => ({
      roll_no: s.roll_no,
      marks: marks[s.roll_no],
      comments: comments[s.roll_no] || "",
      test_code: testCode.toUpperCase().trim(),
      total_marks: totalMarks,
    }));

    try {
      const res = await fetch(`${API_BASE}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: payload, facultyId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Error saving marks");
        return;
      }

      alert("Marks saved successfully!");
    } catch (err) {
      console.error("Save marks error:", err);
      alert("Error saving marks");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-blue-700 mb-8">
          Enter Marks
        </h2>

        <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Test Code
              </label>
              <input
                type="text"
                placeholder="Example: C11M50C10"
                className={`w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 ${
                  testCodeError ? "border-red-500" : "border-gray-300"
                }`}
                value={testCode}
                onChange={(e) => handleTestCode(e.target.value)}
              />
              {testCodeError && (
                <p className="text-red-500 text-xs mt-1">{testCodeError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Class
              </label>
              <select
                className="w-full border rounded-lg px-4 py-3"
                value={classBoard}
                onChange={(e) => setClassBoard(e.target.value)}
              >
                <option value="">Select Class</option>
                {classes.map((c, i) => (
                  <option key={i} value={c.class}>
                    {c.class} — {c.board}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Total Marks
              </label>
              <input
                type="number"
                className="w-full border rounded-lg px-4 py-3"
                value={manualTotal || totalMarks || ""}
                onChange={(e) => setManualTotal(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={loadStudents}
                className="w-full bg-blue-600 text-white px-5 py-3 rounded-lg"
              >
                Load Students
              </button>
            </div>

          </div>
        </div>

        {students.length > 0 && (
          <button
            onClick={submitMarks}
            className="mt-8 bg-green-600 text-white px-8 py-3 rounded-lg"
          >
            Save Marks
          </button>
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