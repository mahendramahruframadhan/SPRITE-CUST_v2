import { Controller, Get, UseGuards } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SessionGuard } from '../auth/session.guard';
import { Perm, PermGuard } from '../auth/perm.guard';

@UseGuards(SessionGuard)
@Controller('masters')
export class MastersController {
  @Get()
  @UseGuards(PermGuard)
  @Perm('form')
  async all() {
    try {
      const p = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src', 'data', 'masters.js');
      const raw = fs.readFileSync(p, 'utf8');
      // masters.js exports masters + priceListData — parse both
      const mastersStr = raw.split('export const masters = ')[1].split('export const priceListData')[0].trim().replace(/;$/, '');
      const priceStr = raw.split('export const priceListData = ')[1].trim().replace(/;$/, '');
      return { masters: JSON.parse(mastersStr), priceListData: JSON.parse(priceStr) };
    } catch (e: any) {
      return { error: String(e.message) };
    }
  }
}
