# Mail.tm Attacker / Victim Test Pages

Static browser pages for authorized testing with disposable Mail.tm accounts.

## Files

- `index.html` - landing page
- `attacker.html` - attacker role mailbox
- `victim.html` - victim role mailbox
- `shared.js` - Mail.tm API logic
- `shared.css` - UI styling

## Usage

1. Open `index.html` in a browser, or serve this folder locally:

   ```bash
   python3 -m http.server 8080
   ```

2. Visit:

   ```text
   http://127.0.0.1:8080/
   ```

3. Open attacker and victim pages.
4. Click `Load domains`.
5. Click `Create email`.
6. Use the generated emails in your authorized testing flow.
7. Click `Refresh inbox` or enable `Auto refresh`.

## Notes

- Data is saved only in browser localStorage.
- The page uses `https://api.mail.tm`.
- Use only on systems you are authorized to test.
- Mail.tm requires attribution when using their API, so the pages include a visible Mail.tm link.


## V2 UI changes

- Wider desktop layout
- More card spacing
- Less cramped account output
- Better responsive layout
- Bigger inbox and message reader areas
