import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { Request, Response } from 'express';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

// Runs the real FilesController on the real express/multer stack,
// with GridFS mocked out so no MongoDB is needed.
describe('FilesController on the patched HTTP stack', () => {
  let app: NestExpressApplication;
  let crashes: Error[];
  const filesService = { uploadFile: jest.fn() };
  const onUncaught = (err: Error) => crashes.push(err);

  beforeEach(async () => {
    crashes = [];
    process.on('uncaughtException', onUncaught);
    filesService.uploadFile.mockReset();
    filesService.uploadFile.mockImplementation(
      async (file: Express.Multer.File) => ({
        filename: file.originalname,
        size: file.size,
      }),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [{ provide: FilesService, useValue: filesService }],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    // Echoes express's req.ip; registered before init so it sits ahead of the 404 handler.
    app
      .getHttpAdapter()
      .get('/__ip', (req: Request, res: Response) => res.send(req.ip));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    process.off('uncaughtException', onUncaught);
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

  it('uploads a multipart file through FileInterceptor', async () => {
    const res = await request(app.getHttpServer())
      .post('/files/upload')
      .attach('file', Buffer.from('hello gridfs'), 'hello.txt')
      .expect(201);

    expect(res.body).toEqual({ filename: 'hello.txt', size: 12 });
    expect(filesService.uploadFile.mock.calls[0][0].buffer.toString()).toBe(
      'hello gridfs',
    );
  });

  it('rejects a truncated multipart body without crashing (multer GHSA-4pg4-qvpc-4q3h, GHSA-fjgf-rc76-4x9p)', async () => {
    const boundary = 'x-boundary';
    const body =
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="a.txt"\r\n' +
      'Content-Type: text/plain\r\n\r\n' +
      'abc';

    const res = await request(app.getHttpServer())
      .post('/files/upload')
      .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
      .send(body);
    await settle();

    expect(crashes).toEqual([]);
    expect(res.status).toBe(400);
    expect(filesService.uploadFile).not.toHaveBeenCalled();
  });

  it('does not trust a client as proxy through a short IPv4-mapped trust subnet (proxy-addr GHSA-jqcg-44mw-7w3h)', async () => {
    app.set('trust proxy', '::ffff:10.0.0.0/8');

    const res = await request(app.getHttpServer())
      .get('/__ip')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);

    expect(res.text).not.toBe('203.0.113.7');
  });
});
