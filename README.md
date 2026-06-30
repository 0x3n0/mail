# Mail.tm Attacker / Victim Test Pages

Static browser page for authorized testing with disposable Mail.tm accounts.

**Live at:** `https://0x3n0.github.io/mail/`

All three views (home, attacker, victim) are in a single `index.html` — navigate via hash (`#home`, `#attacker`, `#victim`).

## Local usage

```bash
python3 -m http.server 8080
# → http://127.0.0.1:8080/
```

Then click **Attacker** or **Victim**, load domains, and create an email.

## Notes

- Data is saved in browser localStorage per role (`mailtm_attacker_session`, `mailtm_victim_session`).
- Uses `https://api.mail.tm`.
- Use only on systems you are authorized to test.
