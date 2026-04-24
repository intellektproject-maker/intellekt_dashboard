export default function UsefulLinksPage() {

  return (

    <div className="p-6 md:p-10">

      <h2 className="text-2xl md:text-3xl font-bold text-blue-700 mb-6">
        Useful Links
      </h2>

      <div className="bg-white shadow-md rounded-xl p-6">

        <ul className="space-y-4">

          <li>
            <a
              href="https://ncert.nic.in"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-blue-600 font-medium hover:underline break-words"
            >
              NCERT Books
            </a>
          </li>

          <li>
            <a
              href="https://khanacademy.org"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-blue-600 font-medium hover:underline break-words"
            >
              Khan Academy
            </a>
          </li>

          <li>
            <a
              href="https://byjus.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-blue-600 font-medium hover:underline break-words"
            >
              BYJU'S
            </a>
          </li>

        </ul>

      </div>

    </div>
  );
}