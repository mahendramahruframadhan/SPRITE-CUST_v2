import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

// Filter exception global — SATU bentuk error untuk SEMUA endpoint:
//   { ok: false, code: string, message: string, statusCode: number }
// - HttpException dengan body {code,message} (dipakai controller/guard) →
//   code & message diteruskan apa adanya.
// - HttpException lain (default Nest) → code dari nama status.
// - Exception tak dikenal → 500 INTERNAL (detail tetap di log server, tidak
//   bocor ke client).
// Bentuk SUKSES tidak diubah di sini (envelope {ok,data} penuh = pekerjaan
// bertahap per controller, dikontrak di backend/README.md).
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: any = exception.getResponse();
      const code =
        (typeof body === 'object' && body?.code) ||
        exception.name.replace('Exception', '').toUpperCase() ||
        'ERROR';
      const message =
        (typeof body === 'object' && body?.message) ||
        (typeof body === 'string' ? body : exception.message) ||
        'Terjadi kesalahan.';
      // Jaga kompatibilitas field lama (frontend membaca message/code) +
      // tambah code dari body bila ada (mis. SESSION_EXPIRED).
      return res.status(status).json({ ok: false, code, message, statusCode: status });
    }

    // Exception non-HTTP: jangan bocorkan detail internal ke client.
    this.logger.error(
      `Unhandled ${req?.method} ${req?.url}: ${(exception as Error)?.message || exception}`,
      (exception as Error)?.stack,
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ok: false,
      code: 'INTERNAL',
      message: 'Terjadi kesalahan internal — coba lagi; bila berulang, hubungi admin.',
      statusCode: 500,
    });
  }
}
