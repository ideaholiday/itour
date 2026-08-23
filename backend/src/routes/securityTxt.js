import express from "express";

const router = express.Router();

const SECURITY_TXT_CONTENT = `# RFC 9116 Security Disclosure Policy for Idea Holiday
Contact: mailto:security@ideaholiday.in
Expires: 2027-12-31T23:59:59.000Z
Preferred-Languages: en, hi
Canonical: https://ideaholiday.in/.well-known/security.txt
Policy: https://ideaholiday.in/terms
Acknowledgments: https://ideaholiday.in/about-us
Hiring: https://ideaholiday.in/contact-us
`;

function serveSecurityTxt(_req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(SECURITY_TXT_CONTENT);
}

router.get("/.well-known/security.txt", serveSecurityTxt);
router.get("/security.txt", serveSecurityTxt);

export default router;
