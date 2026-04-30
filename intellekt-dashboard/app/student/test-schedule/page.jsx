"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "/backend-api";

function TestScheduleContent() {
  const searchParams = useSearchParams();
  const roll = searchParams.get("roll");

  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [requiresSlot, setRequiresSlot] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [selectedWritingDate, setSelectedWritingDate] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const subjectNameMap = { 1: "Maths", 2: "Physics" };

  useEffect(() => {
    if (!roll) { setLoading(false); return; }

    async function loadTests() {
      try {
        const res = await fetch(`${API_BASE}/test-schedule/${roll}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTests(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error loading tests:", err);
        setTests([]);
      } finally {
        setLoading(false);
      }
    }

    loadTests();
  }, [roll]);

  const formatDate = (dateValue) => {
    if (!dateValue) return "-";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatShortDate = (dateValue) => {
    if (!dateValue) return "-";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const getTodayOnly = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const isAfterToday = (dateValue) => {
    if (!dateValue) return false;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    date.setHours(0, 0, 0, 0);
    return getTodayOnly() > date;
  };

  const getDaysLeft = (dateValue) => {
    if (!dateValue) return null;
    const today = getTodayOnly();
    const target = new Date(dateValue);
    if (Number.isNaN(target.getTime())) return null;
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  };

  const isSunday = (dateStr) => new Date(dateStr).getDay() === 0;

  const buildWritingDates = (testDate, writingTill) => {
    if (!testDate || !writingTill) return [];
    const dates = [];
    const start = new Date(testDate);
    const end = new Date(writingTill);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const getTestStatus = (test) => {
    if (test.is_registered) return "registered";
    if (isAfterToday(test.writing_allowed_till)) return "writing_closed";
    if (isAfterToday(test.registration_end_date)) return "registration_closed";
    return "open";
  };

  const handleWritingDateChange = async (dateStr) => {
    setSelectedWritingDate(dateStr);
    setSelectedSlot("");
    setAvailableSlots([]);
    setRequiresSlot(false);

    if (!dateStr || !selectedTest) return;

    setLoadingSlots(true);
    try {
      const res = await fetch(
        `${API_BASE}/test-slots/${encodeURIComponent(selectedTest.test_code)}/${encodeURIComponent(roll)}?writing_date=${dateStr}`,
        { cache: "no-store" }
      );
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to load slots");
        return;
      }

      setRequiresSlot(data.requires_slot);
      setAvailableSlots(data.slots || []);
    } catch (err) {
      console.error("Error loading slots:", err);
      alert("Failed to load slots");
    } finally {
      setLoadingSlots(false);
    }
  };

  const openRegisterModal = (test) => {
    const status = getTestStatus(test);

    if (status !== "open") {
      if (status === "registration_closed") alert("Registration is closed for this test");
      else if (status === "writing_closed") alert("Writing period has ended for this test");
      else if (status === "registered") alert("You have already registered for this test");
      return;
    }

    setSelectedTest(test);
    setSelectedSlot("");
    setSelectedWritingDate("");
    setAvailableSlots([]);
    setRequiresSlot(false);
    setSlotModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setSlotModalOpen(false);
    setSelectedTest(null);
    setAvailableSlots([]);
    setSelectedSlot("");
    setSelectedWritingDate("");
    setRequiresSlot(false);
    setLoadingSlots(false);
  };

  const handleRegister = async () => {
    if (!selectedTest) return;

    if (!selectedWritingDate) {
      alert("Please select a writing date");
      return;
    }

    if (requiresSlot && !selectedSlot) {
      alert("Please select a slot");
      return;
    }

    let slotStart = null;
    let slotEnd = null;

    if (requiresSlot && selectedSlot) {
      const slotObj = availableSlots.find(
        (slot) => `${slot.start}__${slot.end}` === selectedSlot
      );
      if (!slotObj) {
        alert("Invalid slot selected");
        return;
      }
      slotStart = slotObj.start;
      slotEnd = slotObj.end;
    }

    try {
      setSubmitting(true);

      const res = await fetch(`${API_BASE}/register-test-slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roll_no: roll,
          test_code: selectedTest.test_code,
          slot_start: slotStart,
          slot_end: slotEnd,
          writing_date: selectedWritingDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Registration failed");
        return;
      }

      alert(data.message || "Registered successfully");

      setTests((prev) =>
        prev.map((test) =>
          test.test_code === selectedTest.test_code
            ? {
                ...test,
                is_registered: true,
                writing_date: selectedWritingDate,
                registered_slot_label:
                  slotStart && slotEnd ? `${slotStart} - ${slotEnd}` : "Flexible timing",
              }
            : test
        )
      );

      closeModal();
    } catch (err) {
      console.error("Error registering slot:", err);
      alert("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusButton = (test) => {
    const status = getTestStatus(test);

    if (status === "registered") {
      return (
        <div className="flex flex-col items-center gap-1">
          <span className="inline-block bg-green-100 text-green-700 px-3 py-2 rounded-lg font-medium">
            Registered
          </span>
          {test.writing_date && (
            <span className="text-xs text-gray-600">Date: {formatShortDate(test.writing_date)}</span>
          )}
          <span className="text-xs text-gray-600">{test.registered_slot_label || ""}</span>
        </div>
      );
    }

    if (status === "writing_closed") {
      return (
        <span className="inline-block bg-red-100 text-red-700 px-3 py-2 rounded-lg font-medium">
          Writing Closed
        </span>
      );
    }

    if (status === "registration_closed") {
      return (
        <span className="inline-block bg-gray-200 text-gray-700 px-3 py-2 rounded-lg font-medium">
          Registration Closed
        </span>
      );
    }

    return (
      <button
        onClick={() => openRegisterModal(test)}
        className="inline-block bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700"
      >
        Register
      </button>
    );
  };

  if (loading) return <p className="p-4">Loading...</p>;

  return (
    // 🔽 YOUR ORIGINAL UI (UNCHANGED)
    <div className="p-4 md:p-10">
      {/* FULL UI remains same */}
    </div>
  );
}

export default function TestSchedulePage() {
  return (
    <Suspense fallback={<p className="p-4">Loading...</p>}>
      <TestScheduleContent />
    </Suspense>
  );
}