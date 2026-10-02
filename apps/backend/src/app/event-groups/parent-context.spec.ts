import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventGroupsResolver } from './resolver';

describe('event-group parent contexts', () => {
  function setup() {
    const group={id:'group-1',name:'Trilha',emoji:'🌐',majorEventId:'major-1'};
    const tx={eventGroup:{create:jest.fn().mockResolvedValue(group),findFirst:jest.fn().mockResolvedValue(group),update:jest.fn()},event:{findMany:jest.fn().mockResolvedValue([])}};
    const prisma={eventGroup:{findMany:jest.fn().mockResolvedValue([group])},$transaction:jest.fn((work:(tx:unknown)=>unknown)=>work(tx))};
    const search={isEnabled:jest.fn().mockReturnValue(true),searchEventGroups:jest.fn(),upsertEventGroup:jest.fn().mockResolvedValue(undefined)};
    const frozen={assertMajorEventMutable:jest.fn().mockResolvedValue(undefined),assertEventGroupMutable:jest.fn().mockResolvedValue(undefined)};
    const authorization={assertPermissions:jest.fn().mockResolvedValue(undefined),accessibleEventGroupIds:jest.fn().mockResolvedValue(new Set(['group-1']))};
    const resolver=new EventGroupsResolver(prisma as never,search as never,frozen as never,authorization as never);
    return {resolver,prisma,tx,search,frozen,authorization,group};
  }

  it('persists a direct parent only after authorization and frozen-parent checks', async () => {
    const {resolver,tx,frozen,authorization}=setup();
    const user={sub:'organizer'};
    await resolver.createEventGroup({name:'Trilha',majorEventId:'major-1'},{req:{user:user as never}});
    expect(authorization.assertPermissions).toHaveBeenCalledWith(user,[Permission.EventGroup.Create],{majorEventId:'major-1'});
    expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-1',user,'edit');
    expect(tx.eventGroup.create).toHaveBeenCalledWith({data:expect.objectContaining({name:'Trilha',majorEventId:'major-1'})});
  });

  it('never creates a group in an unauthorized parent', async () => {
    const {resolver,prisma,authorization}=setup();
    authorization.assertPermissions.mockRejectedValueOnce(new ForbiddenException());
    await expect(resolver.createEventGroup({name:'Trilha',majorEventId:'major-1'},{})).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([new ForbiddenException('Frozen'),new NotFoundException('Missing parent')])('rejects an unavailable parent before creating data', async (error) => {
    const {resolver,prisma,frozen}=setup();
    frozen.assertMajorEventMutable.mockRejectedValueOnce(error);
    await expect(resolver.createEventGroup({name:'Trilha',majorEventId:'major-1'},{})).rejects.toBe(error);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('intersects scoped grants with direct and legacy parent membership before pagination', async () => {
    const {resolver,prisma,search}=setup();
    await resolver.eventGroups({},'Trilha',12,13,'major-1');
    expect(search.searchEventGroups).not.toHaveBeenCalled();
    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{deletedAt:null,id:{in:['group-1']},name:{contains:'Trilha',mode:'insensitive'},OR:[
        {majorEventId:'major-1'},
        {majorEventId:null,events:{some:{majorEventId:'major-1',deletedAt:null}}},
      ]},orderBy:[{name:'asc'},{id:'asc'}],skip:12,take:13,
    }));
  });

  it('does not silently reparent an existing group and its event hierarchy', async () => {
    const {resolver,tx}=setup();
    await expect(resolver.updateEventGroup('group-1',{majorEventId:'another-major'},{})).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.eventGroup.update).not.toHaveBeenCalled();
  });
});
