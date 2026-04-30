"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://responsible-wonder-production.up.railway.app";

function PostTestInner() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get("id") || "";

  const [testCode, setTestCode] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [marks, setMarks] = useState("");
  const [portion, setPortion] = useState("");
  const [className, setClassName] = useState("");
  const [board, setBoard] = useState("");
  const [duration, setDuration] = useState("");
  const [registrationEndDate, setRegistrationEndDate] = useState("");
  const [writingAllowedTill, setWritingAllowedTill] = useState("");
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

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

  function handleClassChange(e) {
    const val = e.target.value;

    if (!val) {
      setClassName("");
      setBoard("");
      return;
    }

    const [cls, brd] = val.split("||");
    setClassName(cls || "");
    setBoard(brd || "");
  }

  function applyParsedTestCode(value) {
    const upperValue = value.toUpperCase().trim();
    const match = upperValue.match(/^C(\d{2})([PM])(\d+)$/);

    if (!match) return;

    const classNumber = match[1];
    const subjectCode = match[2];
    const totalMarks = match[3];

    setMarks(String(Number(totalMarks)));

    if (subjectCode === "P") setSubject("2");
    if (subjectCode === "M") setSubject("1");

    const matchedClass = classes.find((c) => {
      const cls = (c.class || "").toUpperCase();
      return (
        cls.endsWith(`-${classNumber}`) ||
        cls.endsWith(classNumber) ||
        cls.includes(classNumber)
      );
    });

    if (matchedClass) {
      setClassName(matchedClass.class || "");
      setBoard(matchedClass.board || "");
    }
  }

  function handleTestCodeChange(e) {
    const value = e.target.value.toUpperCase();
    setTestCode(value);
    applyParsedTestCode(value);
  }

  async function postTest() {
    if (
      !testCode ||
      !subject ||
      !date ||
      !marks ||
      !portion ||
      !className ||
      !board ||
      !duration ||
      !registrationEndDate ||
      !writingAllowedTill
    ) {
      alert("Please fill all required fields");
      return;
    }

    const durationNumber = Number(duration);

    if (!Number.isInteger(durationNumber) || durationNumber <= 0) {
      alert("Duration must be a positive whole number in minutes");
      return;
    }

    const testDateObj = new Date(date);
    const registrationEndObj = new Date(registrationEndDate);
    const writingAllowedObj = new Date(writingAllowedTill);

    if (writingAllowedObj < testDateObj) {
      alert("Writing Allowed Till cannot be before Test Date");
      return;
    }

    if (writingAllowedObj < registrationEndObj) {
      alert("Writing Allowed Till cannot be before Registration Active Till");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/post-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_code: testCode.trim().toUpperCase(),
          subject_id: Number(subject),
          test_date: date,
          total_marks: Number(marks),
          portion: portion.trim(),
          created_by: facultyId,
          class_name: className,
          board,
          duration_minutes: durationNumber,
          registration_end_date: registrationEndDate,
          writing_allowed_till: writingAllowedTill,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to post test");
        return;
      }

      alert(data.message || "Test posted successfully");

      setTestCode("");
      setSubject("");
      setDate("");
      setMarks("");
      setPortion("");
      setClassName("");
      setBoard("");
      setDuration("");
      setRegistrationEndDate("");
      setWritingAllowedTill("");
    } catch (err) {
      console.error("Post test error:", err);
      alert("Something went wrong");
    }
  }

  return (
    <div className="p-6 md:p-10 min-h-[80vh] bg-gray-50">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Post Test
      </h1>

      <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <input
            placeholder="Test Code (Example: C12P35)"
            value={testCode}
            onChange={handleTestCodeChange}
            className="border rounded-lg px-4 py-3 text-gray-700"
          />

          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
          >
            <option value="">Select Subject</option>
            <option value="1">Maths</option>
            <option value="2">Physics</option>
          </select>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700"
          />

          <input
            type="number"
            placeholder="Total Marks"
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700"
            min="1"
          />

          <input
            placeholder="Portion"
            value={portion}
            onChange={(e) => setPortion(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700"
          />

          <select
            value={className ? `${className}||${board}` : ""}
            onChange={handleClassChange}
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
            disabled={loadingClasses}
          >
            <option value="">
              {loadingClasses ? "Loading classes..." : "Select Class"}
            </option>

            {classes.map((c, index) => {
              const cls = c.class || "";
              const brd = c.board || "";

              return (
                <option key={index} value={`${cls}||${brd}`}>
                  {cls} — {brd}
                </option>
              );
            })}
          </select>

          <input
            placeholder="Board"
            value={board}
            readOnly
            className="border rounded-lg px-4 py-3 bg-gray-100 text-gray-700"
          />

          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="border rounded-lg px-4 py-3 text-gray-700 bg-white"
          >
            <option value="">Duration (minutes)</option>
            <option value="90">90 minutes</option>
            <option value="180">180 minutes</option>
          </select>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Registration Active Till
            </label>
            <input
              type="date"
              value={registrationEndDate}
              onChange={(e) => setRegistrationEndDate(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 text-gray-700"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Writing Allowed Till
            </label>
            <input
              type="date"
              value={writingAllowedTill}
              onChange={(e) => setWritingAllowedTill(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 text-gray-700"
            />
          </div>
        </div>

        <button
          onClick={postTest}
          className="mt-6 w-full bg-blue-700 text-white py-3 rounded-lg hover:bg-blue-800"
        >
          Create Test
        </button>
      </div>
    </div>
  );
}

export default function PostTest() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <PostTestInner />
    </Suspense>
  );
}