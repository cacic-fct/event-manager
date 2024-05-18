import { TestBed } from '@angular/core/testing';

import { NavigatorUtilsService } from './navigator-utils.service';

describe('NavigatorUtilsService', () => {
  let service: NavigatorUtilsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NavigatorUtilsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
