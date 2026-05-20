"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://responsible-wonder-production.up.railway.app";

const SYLLABUS = {
  maths: {
    title: "Mathematics",
    subjectIds: [1],
    names: ["MATHS", "MATHEMATICS"],
    chapters: {
      1: "Applications of Matrices and Determinants",
      2: "Complex Numbers",
      3: "Theory of Equations",
      4: "Inverse Trigonometric Functions",
      5: "Two Dimensional Analytical Geometry-II",
      6: "Applications of Vector Algebra",
      7: "Applications of Differential Calculus",
      8: "Differentials and Partial Derivatives",
      9: "Applications of Integration",
      10: "Ordinary Differential Equations",
      11: "Probability Distributions",
      12: "Discrete Mathematics",
    },
  },
  physics: {
    title: "Physics",
    subjectIds: [2],
    names: ["PHYSICS"],
    chapters: {
      1: "Applications of Matrices and Determinants",
      2: "Complex Numbers",
      3: "Theory of Equations",
      4: "Inverse Trigonometric Functions",
      5: "Two Dimensional Analytical Geometry-II",
      6: "Applications of Vector Algebra",
      7: "Applications of Differential Calculus",
      8: "Differentials and Partial Derivatives",
      9: "Applications of Integration",
      10: "Ordinary Differential Equations",
      11: "Probability Distributions",
      12: "Discrete Mathematics",
    },
  },
};

function MarksPageContent() {
  const searchParams = useSearchParams();
  const roll = searchParams.get("roll");

  const [marks, setMarks] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedChapter, setSelectedChapter] = useState(null);

  useEffect(() => {
    if (!roll) return;

    async function fetchMarks() {
      try {
        const res = await fetch(`${API_BASE}/marks/${roll}`, {
          cache: "no-store",
        });

        const data = await res.json();
        setMarks(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setMarks([]);
      }
    }

    fetchMarks();
  }, [roll]);

  function renderMark(mark) {
    if (String(mark).toUpperCase() === "A") return "Absent";
    return mark ?? "-";
  }

  function getChapterNo(testCode) {
    const match = String(testCode || "")
      .toUpperCase()
      .match(/C(\d+)$/);

    return match ? Number(match[1]) : null;
  }

  function getPercentage(marksObtained, totalMarks) {
    if (String(marksObtained).toUpperCase() === "A") return 0;

    const obtained = Number(marksObtained);
    const total = Number(totalMarks);

    if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0) {
      return 0;
    }

    return Math.round((obtained / total) * 100);
  }

  function getProgressColor(percent) {
    if (percent < 40) return "bg-red-500";
    if (percent < 70) return "bg-yellow-500";
    return "bg-green-500";
  }

  function getProgressTextColor(percent) {
    if (percent < 40) return "text-red-700";
    if (percent < 70) return "text-yellow-700";
    return "text-green-700";
  }

  const subjectMarks = useMemo(() => {
    if (!marks || !selectedSubject) return [];

    const subject = SYLLABUS[selectedSubject];

    return marks.filter((m) => {
      const subjectIdMatch = subject.subjectIds.includes(Number(m.subject_id));
      const subjectNameMatch = subject.names.includes(
        String(m.subject_name || "").toUpperCase()
      );

      return subjectIdMatch || subjectNameMatch;
    });
  }, [marks, selectedSubject]);

  const chapterData = useMemo(() => {
    if (!selectedSubject) return [];

    const subject = SYLLABUS[selectedSubject];

    return Object.entries(subject.chapters).map(([chapterNo, chapterName]) => {
      const tests = subjectMarks.filter(
        (m) => getChapterNo(m.test_code) === Number(chapterNo)
      );

      const percentages = tests.map((m) =>
        getPercentage(m.marks_obtained, m.total_marks)
      );

      const average =
        percentages.length > 0
          ? Math.round(
              percentages.reduce((sum, value) => sum + value, 0) /
                percentages.length
            )
          : 0;

      return {
        chapterNo: Number(chapterNo),
        chapterName,
        tests,
        average,
      };
    });
  }, [selectedSubject, subjectMarks]);

  const selectedChapterData = chapterData.find(
    (chapter) => chapter.chapterNo === selectedChapter
  );

  function MiniGraph({ tests }) {
    if (!tests || tests.length === 0) {
      return (
        <p className="text-gray-500 text-sm text-center py-6">
          No graph data available for this chapter.
        </p>
      );
    }

    const points = tests.map((test, index) => {
      const x = tests.length === 1 ? 50 : (index / (tests.length - 1)) * 100;
      const y = 100 - getPercentage(test.marks_obtained, test.total_marks);
      return { x, y, percent: 100 - y };
    });

    const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

    return (
      <div className="w-full overflow-x-auto">
        <svg viewBox="0 0 100 110" className="w-full h-64 bg-gray-50 rounded-xl">
          <line x1="0" y1="100" x2="100" y2="100" stroke="#d1d5db" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="#e5e7eb" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#e5e7eb" />
          <line x1="0" y1="25" x2="100" y2="25" stroke="#e5e7eb" />

          <polyline
            points={polyline}
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="2.5"
          />

          {points.map((p, index) => (
            <g key={index}>
              <circle cx={p.x} cy={p.y} r="3" fill="#1d4ed8" />
              <text
                x={p.x}
                y={Math.max(p.y - 6, 8)}
                textAnchor="middle"
                fontSize="5"
                fill="#1f2937"
              >
                {p.percent}%
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  if (!marks) {
    return <p className="p-4">Loading...</p>;
  }

  return (
    <div className="p-4 md:p-10 bg-gray-100 min-h-screen">
      <h2 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Marks
      </h2>

      {!selectedSubject && (
        <div className="flex justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
            {Object.entries(SYLLABUS).map(([key, subject]) => (
              <button
                key={key}
                onClick={() => {
                  setSelectedSubject(key);
                  setSelectedChapter(null);
                }}
                className="bg-white shadow-md rounded-xl border border-gray-200 p-8 hover:shadow-lg hover:scale-[1.02] transition duration-200 text-center"
              >
                <h3 className="text-xl md:text-2xl font-bold text-blue-700 mb-2">
                  {subject.title}
                </h3>
                <p className="text-gray-600">
                  View chapter-wise understanding and test progress
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSubject && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-xl md:text-2xl font-bold text-blue-800">
                {SYLLABUS[selectedSubject].title} - Chapter Progress
              </h3>
              <p className="text-gray-600">
                Understanding percentage is calculated from average test marks.
              </p>
            </div>

            <button
              onClick={() => {
                setSelectedSubject("");
                setSelectedChapter(null);
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white px-5 py-3 rounded-lg font-semibold w-fit"
            >
              Back to Subjects
            </button>
          </div>

          <div className="bg-white shadow rounded-xl p-4 md:p-6 border border-gray-200">
            <div className="space-y-4">
              {chapterData.map((chapter) => (
                <button
                  key={chapter.chapterNo}
                  onClick={() =>
                    setSelectedChapter(
                      selectedChapter === chapter.chapterNo
                        ? null
                        : chapter.chapterNo
                    )
                  }
                  className="w-full text-left border border-gray-200 rounded-xl p-4 hover:shadow-md transition bg-white"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-blue-700">
                        C{chapter.chapterNo} - {chapter.chapterName}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {chapter.tests.length} test
                        {chapter.tests.length === 1 ? "" : "s"} recorded
                      </p>
                    </div>

                    <div className="w-full md:w-80">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Understanding</span>
                        <span
                          className={`font-bold ${getProgressTextColor(
                            chapter.average
                          )}`}
                        >
                          {chapter.average}%
                        </span>
                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-3 rounded-full ${getProgressColor(
                            chapter.average
                          )}`}
                          style={{ width: `${chapter.average}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedChapterData && (
            <div className="bg-white shadow rounded-xl p-4 md:p-6 border border-gray-200">
              <h3 className="text-xl font-bold text-blue-800 mb-2">
                C{selectedChapterData.chapterNo} -{" "}
                {selectedChapterData.chapterName}
              </h3>

              <p
                className={`font-semibold mb-5 ${getProgressTextColor(
                  selectedChapterData.average
                )}`}
              >
                Overall Understanding: {selectedChapterData.average}%
              </p>

              <div className="overflow-x-auto mb-8">
                <table className="min-w-full border text-sm md:text-base">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="p-2 border whitespace-nowrap">
                        Test Code
                      </th>
                      <th className="p-2 border whitespace-nowrap">Date</th>
                      <th className="p-2 border whitespace-nowrap">
                        Marks Obtained
                      </th>
                      <th className="p-2 border whitespace-nowrap">
                        Total Marks
                      </th>
                      <th className="p-2 border whitespace-nowrap">
                        Understanding
                      </th>
                      <th className="p-2 border whitespace-nowrap">
                        Comments
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedChapterData.tests.length > 0 ? (
                      selectedChapterData.tests.map((m, index) => {
                        const percent = getPercentage(
                          m.marks_obtained,
                          m.total_marks
                        );

                        return (
                          <tr key={`${m.test_code}-${index}`}>
                            <td className="p-2 border whitespace-nowrap">
                              {m.test_code || "-"}
                            </td>
                            <td className="p-2 border whitespace-nowrap">
                              {m.test_date
                                ? String(m.test_date).slice(0, 10)
                                : "-"}
                            </td>
                            <td className="p-2 border whitespace-nowrap">
                              {renderMark(m.marks_obtained)}
                            </td>
                            <td className="p-2 border whitespace-nowrap">
                              {m.total_marks ?? "-"}
                            </td>
                            <td
                              className={`p-2 border whitespace-nowrap font-semibold ${getProgressTextColor(
                                percent
                              )}`}
                            >
                              {percent}%
                            </td>
                            <td className="p-2 border break-words">
                              {m.comments || "-"}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan="6"
                          className="p-4 border text-center text-gray-500"
                        >
                          No tests found for this chapter
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h4 className="text-lg font-semibold text-blue-700 mb-3">
                Chapter Progress Graph
              </h4>

              <MiniGraph tests={selectedChapterData.tests} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MarksPage() {
  return (
    <Suspense fallback={<p className="p-4">Loading...</p>}>
      <MarksPageContent />
    </Suspense>
  );
}