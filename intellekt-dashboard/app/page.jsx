"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  MapPin,
  Mail,
  Phone,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
} from "lucide-react";

const cards = [
  {
    title: (
      <>
        Empowering the
        <br />
        Future of
        <br />
        Academic
        <br />
        Excellence
      </>
    ),
    description:
      "Intellekt Academy is designed to redefine academic management with secure dashboards, performance tracking, simplified workflows, and a modern digital learning environment.",
    image: "/slide1.png",
    alt: "Academic excellence",
  },
  {
    title: <>About Us</>,
    description:
      "Intellekt Academy is a modern student management platform designed to simplify workflows and enhance performance tracking.",
    image: "/slide2.png",
    alt: "About Intellekt Academy",
  },
];

const API_BASE = "https://responsible-wonder-production.up.railway.app";

export default function Home() {
  const router = useRouter();

  const [currentCard, setCurrentCard] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const contactRef = useRef(null);
  const enquiryRef = useRef(null);

  const [formData, setFormData] = useState({
    studentName: "",
    className: "",
    board: "",
    schoolName: "",
    subjects: "",
    modeOfEducation: "",
    parentName: "",
    mobileNumber: "",
    area: "",
  });

  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentCard((prev) => (prev + 1) % cards.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const goPrev = () => {
    setCurrentCard((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const goNext = () => {
    setCurrentCard((prev) => (prev + 1) % cards.length);
  };

  const scrollToSection = (ref) => {
    if (!ref.current) return;

    const headerOffset = 140;
    const elementPosition =
      ref.current.getBoundingClientRect().top + window.pageYOffset;

    window.scrollTo({
      top: elementPosition - headerOffset,
      behavior: "smooth",
    });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const sanitizeName = (value) => {
    return value
      .replace(/[^A-Za-z\s]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "");
  };

  const sanitizeSchoolName = (value) => {
    return value
      .replace(/[^A-Za-z0-9\s.,&()'-]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "");
  };

  const sanitizeArea = (value) => {
    return value
      .replace(/[^A-Za-z0-9\s,.-]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "");
  };

  const sanitizePhone = (value) => {
    return value.replace(/\D/g, "").slice(0, 10);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let cleanedValue = value;

    if (name === "studentName" || name === "parentName") {
      cleanedValue = sanitizeName(value);
    } else if (name === "schoolName") {
      cleanedValue = sanitizeSchoolName(value);
    } else if (name === "area") {
      cleanedValue = sanitizeArea(value);
    } else if (name === "mobileNumber") {
      cleanedValue = sanitizePhone(value);

      if (cleanedValue.length > 0 && cleanedValue.length !== 10) {
        setPhoneError("Phone number must contain exactly 10 digits");
      } else {
        setPhoneError("");
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]: cleanedValue,
    }));
  };

  const validateForm = () => {
    const studentName = formData.studentName.trim();
    const parentName = formData.parentName.trim();
    const schoolName = formData.schoolName.trim();
    const area = formData.area.trim();
    const mobileNumber = formData.mobileNumber.trim();

    if (!studentName || !/^[A-Za-z\s]+$/.test(studentName)) {
      alert("Student name should contain only letters and spaces.");
      return false;
    }

    if (!formData.className) {
      alert("Please select class.");
      return false;
    }

    if (!formData.board) {
      alert("Please select board.");
      return false;
    }

    if (!schoolName || !/^[A-Za-z0-9\s.,&()'-]+$/.test(schoolName)) {
      alert(
        "School name should not be empty and should contain only valid characters."
      );
      return false;
    }

    if (!formData.subjects) {
      alert("Please select subject.");
      return false;
    }

    if (!formData.modeOfEducation) {
      alert("Please select mode of education.");
      return false;
    }

    if (!parentName || !/^[A-Za-z\s]+$/.test(parentName)) {
      alert("Parent name should contain only letters and spaces.");
      return false;
    }

    if (!/^\d{10}$/.test(mobileNumber)) {
      setPhoneError("Phone number must contain exactly 10 digits");
      alert("Phone number must contain exactly 10 digits.");
      return false;
    }

    if (!area || !/^[A-Za-z0-9\s,.-]+$/.test(area)) {
      alert("Area should contain only valid characters.");
      return false;
    }

    return true;
  };

  const handleEnquirySubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    const classBoard = `${formData.board}-${formData.className}`;

    try {
      const res = await fetch(`${API_BASE}/enquiries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentName: formData.studentName.trim(),
          classBoard,
          schoolName: formData.schoolName.trim(),
          subjects: formData.subjects,
          modeOfEducation: formData.modeOfEducation,
          parentName: formData.parentName.trim(),
          mobileNumber: formData.mobileNumber.trim(),
          area: formData.area.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || data.error || "Failed to submit enquiry");
        return;
      }

      alert("Enquiry submitted successfully!");

      setFormData({
        studentName: "",
        className: "",
        board: "",
        schoolName: "",
        subjects: "",
        modeOfEducation: "",
        parentName: "",
        mobileNumber: "",
        area: "",
      });
      setPhoneError("");
    } catch (error) {
      console.error("Enquiry error:", error);
      alert("Server error while submitting enquiry");
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f6fb] scroll-smooth">
      <header className="fixed top-0 left-0 w-full z-50 bg-white shadow-sm border-b border-gray-200">
        <div className="flex justify-end items-center gap-2 sm:gap-3 px-4 sm:px-8 md:px-16 py-4 flex-wrap">
          <button
            onClick={() => scrollToSection(contactRef)}
            className="text-[#0b1f5f] border border-[#0b1f5f] px-3 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-medium hover:bg-[#0b1f5f] hover:text-white transition"
          >
            Contact Us
          </button>

          <button
            onClick={() => scrollToSection(enquiryRef)}
            className="text-[#0b1f5f] border border-[#0b1f5f] px-3 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-medium hover:bg-[#0b1f5f] hover:text-white transition"
          >
            Enquiry
          </button>

          <button
            onClick={() => router.push("/login")}
            className="bg-blue-700 text-white px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-medium hover:bg-blue-800 transition"
          >
            Login
          </button>
        </div>
      </header>

      <section className="relative w-full pt-24 sm:pt-28 md:pt-32 pb-10 sm:pb-12 md:pb-14 px-4 sm:px-6 md:px-12 lg:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-[24px] sm:rounded-[28px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] px-5 sm:px-8 md:px-12 py-5 sm:py-6 text-center">
            <h1 className="text-[#0b1f5f] text-2xl sm:text-3xl md:text-5xl font-extrabold tracking-tight">
              Intellekt Academy
            </h1>
            <p className="mt-2 text-gray-600 text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
              Elevating academic excellence through innovative learning
              experiences, personalized growth, and modern student management.
            </p>
          </div>

          <div className="relative mt-6 sm:mt-8">
            <div className="overflow-hidden rounded-[24px] sm:rounded-[30px]">
              <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${currentCard * 100}%)` }}
              >
                {cards.map((card, index) => (
                  <div
                    key={index}
                    className="w-full shrink-0 bg-[#edf4ff] shadow-[0_12px_35px_rgba(0,0,0,0.08)] rounded-[24px] sm:rounded-[30px] px-4 sm:px-6 md:px-10 py-5 sm:py-7 md:py-10"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 md:gap-8 items-center">
                      <div className="order-1 text-left">
                        <h2
                          className={`text-[#0b1f5f] font-extrabold leading-[1.05] ${
                            index === 1
                              ? "text-3xl sm:text-4xl md:text-5xl"
                              : "text-3xl sm:text-4xl md:text-6xl"
                          }`}
                        >
                          {card.title}
                        </h2>

                        <p className="mt-5 text-gray-600 text-base sm:text-lg md:text-[19px] leading-relaxed max-w-2xl">
                          {card.description}
                        </p>
                      </div>

                      <div className="order-2">
                        <div className="relative w-full h-[220px] sm:h-[280px] md:h-[340px] lg:h-[360px] rounded-[18px] overflow-hidden shadow-[0_8px_20px_rgba(0,0,0,0.15)] bg-black">
                          <Image
                            src={card.image}
                            alt={card.alt}
                            fill
                            className="object-cover"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={goPrev}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 bg-white/95 hover:bg-white shadow-md rounded-full p-2 sm:p-3 transition"
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-[#0b1f5f]" />
            </button>

            <button
              onClick={goNext}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 bg-white/95 hover:bg-white shadow-md rounded-full p-2 sm:p-3 transition"
              aria-label="Next slide"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-[#0b1f5f]" />
            </button>

            <div className="flex justify-center gap-2 mt-5">
              {cards.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentCard(index)}
                  className={`h-2.5 rounded-full transition-all ${
                    currentCard === index ? "w-8 bg-blue-700" : "w-2.5 bg-blue-200"
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 md:px-12 lg:px-16 pb-12 md:pb-16">
        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div
            ref={contactRef}
            className="bg-white rounded-2xl shadow-md p-6 sm:p-8 md:p-10 scroll-mt-32"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-black mb-6 text-center md:text-left">
              Contact Us
            </h2>

            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-700 mt-1 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Email</p>
                  <p className="text-gray-600 text-sm sm:text-base break-all">
                    support@intellekt.com
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-blue-700 mt-1 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Phone</p>
                  <p className="text-gray-600 text-sm sm:text-base">
                    +91 98765 43210
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-blue-700 mt-1 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Location</p>
                  <a
                    href="https://maps.app.goo.gl/B4JhSmtsjJsx9ixT9"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 hover:text-blue-900 text-sm sm:text-base break-all"
                  >
                    https://maps.app.goo.gl/B4JhSmtsjJsx9ixT9
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={enquiryRef}
            className="bg-white rounded-2xl shadow-md p-6 sm:p-8 md:p-10 scroll-mt-32"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-black mb-6 text-center md:text-left">
              Enquiry
            </h2>

            <form onSubmit={handleEnquirySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Student Name
                </label>
                <input
                  type="text"
                  name="studentName"
                  value={formData.studentName}
                  onChange={handleChange}
                  placeholder="Enter student name"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-700"
                  required
                  maxLength={50}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Class
                </label>
                <select
                  name="className"
                  value={formData.className}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-700 bg-white"
                  required
                >
                  <option value="">Select class</option>
                  <option value="10">10</option>
                  <option value="11">11</option>
                  <option value="12">12</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Board
                </label>
                <select
                  name="board"
                  value={formData.board}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-700 bg-white"
                  required
                >
                  <option value="">Select board</option>
                  <option value="CBSE">CBSE</option>
                  <option value="Stateboard">Stateboard</option>
                  <option value="Isc">Isc</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  School Name
                </label>
                <input
                  type="text"
                  name="schoolName"
                  value={formData.schoolName}
                  onChange={handleChange}
                  placeholder="Enter school name"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-700"
                  required
                  maxLength={100}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Subjects
                </label>
                <select
                  name="subjects"
                  value={formData.subjects}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-700 bg-white"
                  required
                >
                  <option value="">Select subject</option>
                  <option value="Physics">Physics</option>
                  <option value="Math">Math</option>
                  <option value="Both">Both</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Mode of Education
                </label>
                <select
                  name="modeOfEducation"
                  value={formData.modeOfEducation}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-700 bg-white"
                  required
                >
                  <option value="">Select mode</option>
                  <option value="Online">Online</option>
                  <option value="Offline">Offline</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Parent Name
                </label>
                <input
                  type="text"
                  name="parentName"
                  value={formData.parentName}
                  onChange={handleChange}
                  placeholder="Enter parent name"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-700"
                  required
                  maxLength={50}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="mobileNumber"
                  value={formData.mobileNumber}
                  onChange={handleChange}
                  placeholder="Enter phone number"
                  className={`w-full border rounded-xl px-4 py-3 outline-none focus:border-blue-700 ${
                    phoneError ? "border-red-500" : "border-gray-300"
                  }`}
                  required
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="off"
                />
                {phoneError && (
                  <p className="text-red-500 text-sm mt-1">{phoneError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Area
                </label>
                <input
                  type="text"
                  name="area"
                  value={formData.area}
                  onChange={handleChange}
                  placeholder="Enter area"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-700"
                  required
                  maxLength={80}
                  autoComplete="off"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-700 text-white py-3 rounded-xl font-semibold hover:bg-blue-800 transition"
              >
                Submit Enquiry
              </button>
            </form>
          </div>
        </div>
      </section>

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 bg-blue-700 hover:bg-blue-800 text-white rounded-full p-3 shadow-lg transition"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}