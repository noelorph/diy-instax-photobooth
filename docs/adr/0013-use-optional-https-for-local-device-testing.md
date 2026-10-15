# Use optional HTTPS for local device testing

The iPhone printing qualification in [ADR-0012](0012-qualify-development-on-iphone-before-ipad-launch.md) needs an HTTPS page accessible from the test device. The owner's local certificate and key must stay outside Git. Requiring those files for every `npm run dev` session would prevent a fresh checkout from starting the ordinary development server.

Keep `npm run dev` on Next.js's default HTTP server. Use `npm run dev:https` when testing from a device: it starts Next.js development mode with `certificates/booth-key.pem` and `certificates/booth.pem`. Ignore the `certificates/` directory in Git. The tester supplies a certificate trusted by the device and valid for the hostname or network address used. This command is for local development; it does not change the application's deployment HTTPS configuration or the hardware qualification gates.
