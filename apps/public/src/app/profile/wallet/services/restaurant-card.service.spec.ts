import { TestBed } from '@angular/core/testing';
import { OfflinePublicDataAccessService } from '@cacic-fct/offline-public-data-access';
import { RestaurantCardService } from './restaurant-card.service';

describe('RestaurantCardService', () => {
  let service: RestaurantCardService;
  let getRestaurantCard: ReturnType<typeof vi.fn>;
  let replaceRestaurantCard: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getRestaurantCard = vi.fn();
    replaceRestaurantCard = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        RestaurantCardService,
        {
          provide: OfflinePublicDataAccessService,
          useValue: { getRestaurantCard, replaceRestaurantCard },
        },
      ],
    });
    service = TestBed.inject(RestaurantCardService);
  });

  it('discards a stale load that resolves after a card is saved', async () => {
    let resolveLoad!: (value: { cardNumber: string } | null) => void;
    getRestaurantCard.mockReturnValue(new Promise((resolve) => (resolveLoad = resolve)));

    const loading = service.load('user-1');
    await service.save('user-1', '123-456');
    resolveLoad({ cardNumber: '000000' });
    await loading;

    expect(service.get('user-1')).toBe('123456');
  });
});
