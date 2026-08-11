"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://responsible-wonder-production.up.railway.app";

const SYLLABUS = {
  "12": {
    STATE_BOARD: {
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
          1: "Electrostatics",
          2: "Current Electricity",
          3: "Magnetism and Magnetic Effects of Electric Current",
          4: "Electromagnetic Induction and Alternating Current",
          5: "Electromagnetic Waves",
          6: "Ray Optics",
          7: "Wave Optics",
          8: "Dual Nature of Radiation and Matter",
          9: "Atomic and Nuclear Physics",
          10: "Electronics and Communication",
          11: "Recent Developments in Physics",
        },
      },
    },

    CBSE: {
      maths: {
        title: "Mathematics",
        subjectIds: [1],
        names: ["MATHS", "MATHEMATICS"],
        chapters: {
          1: "Relations and Functions",
          2: "Inverse Trigonometric Functions",
          3: "Matrices",
          4: "Determinants",
          5: "Continuity and Differentiability",
          6: "Applications of Derivatives",
          7: "Integrals",
          8: "Applications of Integrals",
          9: "Differential Equations",
          10: "Vectors",
          11: "Three Dimensional Geometry",
          12: "Linear Programming",
          13: "Probability",
        },
      },

      physics: {
        title: "Physics",
        subjectIds: [2],
        names: ["PHYSICS"],
        chapters: {
          1: "Electric Charges and Fields / Electrostatic Potential & Capacitance",
          2: "Current Electricity",
          3: "Moving Charges and Magnetism / Magnetism and Matter",
          4: "Electromagnetic Induction / Alternating Current",
          5: "Electromagnetic Waves",
          6: "Ray Optics / Wave Optics",
          7: "Dual Nature of Radiation and Matter",
          8: "Atoms / Nuclei",
          9: "Semiconductor Electronics / Communication Systems",
        },
      },
    },

    ISC: {
      maths: {
        title: "Mathematics",
        subjectIds: [1],
        names: ["MATHS", "MATHEMATICS"],
        chapters: {
          1: "Relations and Functions",
          2: "Algebra (Matrices & Determinants)",
          3: "Calculus (Continuity, Differentiation, Integration, DEs)",
          4: "Probability",
          5: "Vectors",
          6: "Three Dimensional Geometry",
          7: "Applications of Integrals",
          8: "Applications of Calculus (Commerce/Economics)",
          9: "Linear Regression",
          10: "Linear Programming",
        },
      },

      physics: {
        title: "Physics",
        subjectIds: [2],
        names: ["PHYSICS"],
        chapters: {
          1: "Electrostatics",
          2: "Current Electricity",
          3: "Magnetism and Magnetic Effects of Current",
          4: "Electromagnetic Induction and Alternating Currents",
          5: "Electromagnetic Waves",
          6: "Optics (Ray and Wave)",
          7: "Dual Nature of Radiation and Matter",
          8: "Atoms and Nuclei",
          9: "Electronic Devices and Communication",
        },
      },
    },
  },
};

function normalizeBoard(board) {
  const value = String(board || "").toUpperCase().trim();

  if (value.includes("CBSE")) return "CBSE";
  if (value.includes("ISC") || value.includes("CISCE")) return "ISC";
  if (value.includes("STATE") || value.includes("SB")) return "STATE_BOARD";

  return "STATE_BOARD";
}

function normalizeClass(classValue) {
  const value = String(classValue || "").toUpperCase().trim();
  const match = value.match(/\d+/);

  return match ? match[0] : "12";
}

function MarksPageContent() {
  const searchParams = useSearchParams();
  const roll = searchParams.get("roll");

  const [marks, setMarks] = useState(null);
  const [student, setStudent] = useState(null);
  const [reportSubject, setReportSubject] = useState(null);

  // Can be:
  // null
  // number -> chapter number
  // "combined" -> combined tests
  const [selectedChapter, setSelectedChapter] = useState(null);

  useEffect(() => {
    if (!roll) return;

    async function fetchData() {
      try {
        const [marksRes, studentRes] = await Promise.all([
          fetch(`${API_BASE}/marks/${roll}`, {
            cache: "no-store",
          }),
          fetch(`${API_BASE}/student/${roll}`, {
            cache: "no-store",
          }),
        ]);

        const marksData = await marksRes.json();
        const studentData = await studentRes.json();

        setMarks(Array.isArray(marksData) ? marksData : []);
        setStudent(studentData || null);
      } catch (err) {
        console.error(err);

        setMarks([]);
        setStudent(null);
      }
    }

    fetchData();
  }, [roll]);

  const classKey = normalizeClass(
    student?.class ||
      student?.class_name ||
      marks?.[0]?.class ||
      marks?.[0]?.class_name
  );

  const boardKey = normalizeBoard(
    student?.board ||
      marks?.[0]?.board ||
      marks?.[0]?.student_board
  );

  const currentSyllabus =
    SYLLABUS[classKey]?.[boardKey] || SYLLABUS["12"].STATE_BOARD;

  function renderMark(mark) {
    if (String(mark).toUpperCase() === "A") {
      return "Absent";
    }

    return mark ?? "-";
  }

  function renderMarksFraction(marksObtained, totalMarks) {
    if (String(marksObtained).toUpperCase() === "A") {
      return `Absent/${totalMarks ?? "-"}`;
    }

    return `${marksObtained ?? "-"}/${totalMarks ?? "-"}`;
  }

  /*
   * IMPORTANT:
   * Chapter grouping is now based on the `chapter` field
   * coming from the backend /marks/{roll} response.
   *
   * Examples:
   *   chapter = "6"         -> Chapter 6
   *   chapter = 6           -> Chapter 6
   *   chapter = "chapter 6" -> Chapter 6
   *   chapter = "combined"  -> Combined Tests
   */

  function getChapterValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase();

    if (!normalized) {
      return null;
    }

    if (normalized === "combined") {
      return "combined";
    }

    const match = normalized.match(/\d+/);

    if (!match) {
      return null;
    }

    return Number(match[0]);
  }

  function isCombinedTest(test) {
    return (
      String(test?.chapter || "")
        .trim()
        .toLowerCase() === "combined"
    );
  }

  function getPercentage(marksObtained, totalMarks) {
    if (String(marksObtained).toUpperCase() === "A") {
      return 0;
    }

    const obtained = Number(marksObtained);
    const total = Number(totalMarks);

    if (
      !Number.isFinite(obtained) ||
      !Number.isFinite(total) ||
      total <= 0
    ) {
      return 0;
    }

    return (obtained / total) * 100;
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

  function getWeekOfMonthLabel(dateValue) {
    if (!dateValue) return "-";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    const day = date.getDate();
    const week = Math.ceil(day / 7);
    const month = date.toLocaleString("en-US", {
      month: "long",
    });

    const suffix =
      week === 1
        ? "st"
        : week === 2
        ? "nd"
        : week === 3
        ? "rd"
        : "th";

    return `${week}${suffix} week of ${month}`;
  }

  function filterBySubject(subjectKey) {
    const subject = currentSyllabus[subjectKey];

    if (!marks || !subject) {
      return [];
    }

    return marks.filter((m) => {
      const subjectIdMatch = subject.subjectIds.includes(
        Number(m.subject_id)
      );

      const subjectNameMatch = subject.names.includes(
        String(m.subject_name || "").toUpperCase()
      );

      return subjectIdMatch || subjectNameMatch;
    });
  }

  const mathsMarks = useMemo(
    () => filterBySubject("maths"),
    [marks, currentSyllabus]
  );

  const physicsMarks = useMemo(
    () => filterBySubject("physics"),
    [marks, currentSyllabus]
  );

  const reportMarks = useMemo(() => {
    if (!reportSubject) {
      return [];
    }

    return filterBySubject(reportSubject);
  }, [marks, reportSubject, currentSyllabus]);

  /*
   * Chapter data
   *
   * Each chapter is now determined from:
   *
   *     m.chapter
   *
   * instead of trying to extract the chapter number
   * from test_code.
   */
  const chapterData = useMemo(() => {
    if (!reportSubject) {
      return [];
    }

    const subject = currentSyllabus[reportSubject];

    if (!subject) {
      return [];
    }

    return Object.entries(subject.chapters).map(
      ([chapterNo, chapterName]) => {
        const chapterNumber = Number(chapterNo);

        const tests = reportMarks.filter((m) => {
          const testChapter = getChapterValue(m.chapter);

          return testChapter === chapterNumber;
        });

        /*
         * Calculate overall understanding using total marks:
         *
         * sum(obtained) / sum(total) * 100
         *
         * This means:
         *
         * 11/40
         * 20/40
         * 27/40
         * 16/40
         *
         * becomes:
         *
         * 74/160 = 46.25% -> 46%
         *
         * Absent tests are excluded.
         */
        const validTests = tests.filter(
          (m) =>
            String(m.marks_obtained).toUpperCase() !== "A" &&
            Number.isFinite(Number(m.marks_obtained)) &&
            Number.isFinite(Number(m.total_marks)) &&
            Number(m.total_marks) > 0
        );

        const totalObtained = validTests.reduce(
          (sum, m) => sum + Number(m.marks_obtained),
          0
        );

        const totalPossible = validTests.reduce(
          (sum, m) => sum + Number(m.total_marks),
          0
        );

        const average =
          totalPossible > 0
            ? Math.round((totalObtained / totalPossible) * 100)
            : 0;

        return {
          chapterNo: chapterNumber,
          chapterName,
          tests,
          average,
        };
      }
    );
  }, [reportSubject, reportMarks, currentSyllabus]);

  /*
   * Combined tests are kept completely separate
   * from chapter analytics.
   */
  const combinedTests = useMemo(() => {
    if (!reportSubject) {
      return [];
    }

    return reportMarks.filter((m) => isCombinedTest(m));
  }, [reportSubject, reportMarks]);

  function HistogramGraph({ tests }) {
    if (!tests || tests.length === 0) {
      return (
        <p className="text-gray-500 text-sm text-center py-8">
          No graph data available for this chapter.
        </p>
      );
    }

    const graphTests = tests.map((test) => ({
      ...test,
      percent: Math.round(
        getPercentage(test.marks_obtained, test.total_marks)
      ),
    }));

    const maxBarHeight = 220;

    return (
      <div className="w-full overflow-x-auto bg-gray-50 rounded-xl border border-gray-200 p-5">
        <div className="min-w-[700px]">
          <div className="flex gap-4">
            <div className="flex flex-col justify-between h-[260px] text-xs text-gray-600 font-semibold pr-2">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>

            <div className="flex-1">
              <div className="relative h-[260px] border-l border-b border-gray-700">
                {[0, 25, 50, 75, 100].map((value) => (
                  <div
                    key={value}
                    className="absolute left-0 right-0 border-t border-gray-200"
                    style={{ bottom: `${value}%` }}
                  />
                ))}

                <div className="absolute inset-0 flex items-end justify-around gap-4 px-4">
                  {graphTests.map((test, index) => {
                    const barHeight = Math.max(
                      4,
                      (test.percent / 100) * maxBarHeight
                    );

                    return (
                      <div
                        key={`${test.test_code}-${index}`}
                        className="flex flex-col items-center justify-end h-full min-w-[80px]"
                      >
                        <span className="text-xs font-bold text-gray-800 mb-2">
                          {test.percent}%
                        </span>

                        <div
                          className={`w-12 rounded-t-lg ${getProgressColor(
                            test.percent
                          )}`}
                          style={{
                            height: `${barHeight}px`,
                          }}
                          title={`${test.test_code}: ${test.percent}%`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-around gap-4 px-4 mt-3">
                {graphTests.map((test, index) => (
                  <div
                    key={`${test.test_code}-label-${index}`}
                    className="text-xs text-gray-700 font-semibold text-center min-w-[80px] break-words"
                  >
                    {test.test_code || "-"}
                  </div>
                ))}
              </div>

              <p className="text-center text-sm font-bold text-gray-700 mt-4">
                Test Code
              </p>
            </div>
          </div>

          <p className="text-sm font-bold text-gray-700 mt-2">
            Y-axis: Percentage
          </p>
        </div>
      </div>
    );
  }

  function ChapterDetails({ chapter }) {
    return (
      <div className="bg-white rounded-xl border border-blue-200 p-4 md:p-6 mt-3 shadow-sm">
        <h4 className="text-xl md:text-2xl font-bold text-blue-800 mb-2">
          C{chapter.chapterNo} - {chapter.chapterName}
        </h4>

        <p
          className={`font-semibold mb-5 ${getProgressTextColor(
            chapter.average
          )}`}
        >
          Overall Understanding: {chapter.average}%
        </p>

        <div className="overflow-x-auto mb-8">
          <table className="min-w-full border text-sm md:text-base">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-2 border whitespace-nowrap">
                  Test Code
                </th>
                <th className="p-2 border whitespace-nowrap">
                  Test Date
                </th>
                <th className="p-2 border whitespace-nowrap">
                  Marks Obtained
                </th>
                <th className="p-2 border whitespace-nowrap">
                  Total Marks
                </th>
                <th className="p-2 border whitespace-nowrap">
                  Comments
                </th>
              </tr>
            </thead>

            <tbody>
              {chapter.tests.length > 0 ? (
                chapter.tests.map((m, index) => (
                  <tr key={`${m.test_code}-${index}`}>
                    <td className="p-2 border whitespace-nowrap">
                      {m.test_code || "-"}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      {m.test_date
                        ? new Date(m.test_date).toLocaleDateString(
                            "en-GB"
                          )
                        : "-"}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      {renderMark(m.marks_obtained)}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      {m.total_marks ?? "-"}
                    </td>

                    <td className="p-2 border break-words">
                      {m.comments || "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="5"
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
          Chapter Histogram
        </h4>

        <HistogramGraph tests={chapter.tests} />
      </div>
    );
  }

  /*
   * Combined Tests Details
   *
   * IMPORTANT:
   * No graph.
   * No understanding percentage.
   * No analytics.
   *
   * Just the test table.
   */
  function CombinedTestsDetails({ tests }) {
    return (
      <div className="bg-white rounded-xl border border-blue-200 p-4 md:p-6 mt-3 shadow-sm">
        <h4 className="text-xl md:text-2xl font-bold text-blue-800 mb-5">
          Combined Tests
        </h4>

        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm md:text-base">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-2 border whitespace-nowrap">
                  Test Code
                </th>

                <th className="p-2 border whitespace-nowrap">
                  Test Date
                </th>

                <th className="p-2 border whitespace-nowrap">
                  Marks Obtained
                </th>

                <th className="p-2 border whitespace-nowrap">
                  Total Marks
                </th>

                <th className="p-2 border whitespace-nowrap">
                  Comments
                </th>
              </tr>
            </thead>

            <tbody>
              {tests.length > 0 ? (
                tests.map((m, index) => (
                  <tr key={`${m.test_code}-${index}`}>
                    <td className="p-2 border whitespace-nowrap">
                      {m.test_code || "-"}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      {m.test_date
                        ? new Date(m.test_date).toLocaleDateString(
                            "en-GB"
                          )
                        : "-"}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      {renderMark(m.marks_obtained)}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      {m.total_marks ?? "-"}
                    </td>

                    <td className="p-2 border break-words">
                      {m.comments || "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="5"
                    className="p-4 border text-center text-gray-500"
                  >
                    No combined tests found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const renderTable = (title, data, subjectKey) => (
    <div className="mb-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h3 className="text-xl md:text-2xl font-bold text-blue-800">
          {title}
        </h3>

        <button
          type="button"
          onClick={() => {
            setReportSubject(subjectKey);
            setSelectedChapter(null);
          }}
          className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 rounded-lg font-semibold w-fit"
        >
          View Report
        </button>
      </div>

      <div className="bg-white shadow rounded-xl p-4 md:p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm md:text-base">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-2 border whitespace-nowrap">
                  Test Code
                </th>

                <th className="p-2 border whitespace-nowrap">
                  Test Date
                </th>

                <th className="p-2 border whitespace-nowrap">
                  Marks Obtained
                </th>

                <th className="p-2 border whitespace-nowrap">
                  Total Marks
                </th>

                <th className="p-2 border whitespace-nowrap">
                  Comments
                </th>
              </tr>
            </thead>

            <tbody>
              {data.length > 0 ? (
                data.map((m, index) => (
                  <tr key={`${m.test_code}-${index}`}>
                    <td className="p-2 border whitespace-nowrap">
                      {m.test_code || "-"}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      {m.test_date
                        ? new Date(m.test_date).toLocaleDateString(
                            "en-GB"
                          )
                        : "-"}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      {renderMark(m.marks_obtained)}
                    </td>

                    <td className="p-2 border whitespace-nowrap">
                      {m.total_marks ?? "-"}
                    </td>

                    <td className="p-2 border break-words">
                      {m.comments || "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="5"
                    className="p-4 border text-center text-gray-500"
                  >
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (!marks) {
    return <p className="p-4">Loading...</p>;
  }

  return (
    <div className="p-4 md:p-10 bg-gray-100 min-h-screen">
      <h2 className="text-2xl md:text-3xl font-bold text-blue-800 mb-6">
        Marks
      </h2>

      {renderTable("Mathematics", mathsMarks, "maths")}

      {renderTable("Physics", physicsMarks, "physics")}

      {reportSubject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-7xl max-h-[90vh] overflow-y-auto p-5 md:p-7">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-blue-800 mb-1">
                  {currentSyllabus[reportSubject]?.title} Detailed Report
                </h3>

                <p className="text-gray-600">
                  Chapter-wise understanding based on test marks.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReportSubject(null);
                  setSelectedChapter(null);
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg font-semibold w-fit"
              >
                Close
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
              <h4 className="text-lg font-semibold text-blue-700 mb-4">
                Chapter Progress
              </h4>

              <div className="space-y-4">
                {chapterData.map((chapter) => (
                  <div key={chapter.chapterNo}>
                    <button
                      type="button"
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
                          <h5 className="font-semibold text-blue-700">
                            C{chapter.chapterNo} -{" "}
                            {chapter.chapterName}
                          </h5>

                          <p className="text-sm text-gray-500">
                            {chapter.tests.length} test
                            {chapter.tests.length === 1
                              ? ""
                              : "s"}{" "}
                            recorded
                          </p>
                        </div>

                        <div className="w-full md:w-80">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">
                              Understanding
                            </span>

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
                              style={{
                                width: `${chapter.average}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>

                    {selectedChapter === chapter.chapterNo && (
                      <ChapterDetails chapter={chapter} />
                    )}
                  </div>
                ))}

                {/* =====================================================
                    COMBINED TESTS
                    ===================================================== */}

                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedChapter(
                        selectedChapter === "combined"
                          ? null
                          : "combined"
                      )
                    }
                    className="w-full text-left border border-gray-200 rounded-xl p-4 hover:shadow-md transition bg-white"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <h5 className="font-semibold text-blue-700">
                          Combined Tests
                        </h5>

                        <p className="text-sm text-gray-500">
                          {combinedTests.length} test
                          {combinedTests.length === 1
                            ? ""
                            : "s"}{" "}
                          recorded
                        </p>
                      </div>

                      <div className="text-sm font-semibold text-blue-700">
                        View Tests →
                      </div>
                    </div>
                  </button>

                  {selectedChapter === "combined" && (
                    <CombinedTestsDetails tests={combinedTests} />
                  )}
                </div>
              </div>
            </div>
          </div>
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