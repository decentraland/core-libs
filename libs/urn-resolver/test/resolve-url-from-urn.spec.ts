import { RFC2141 } from 'urn-lib'
import { resolveUrlFromUrn } from '../src'
import type { ResolversOptions } from '../src'

describe('when calling resolveUrlFromUrn', () => {
  let urn: string
  let result: string | null

  describe('and the URN is not a valid urn: scheme (missing urn prefix)', () => {
    it('should return null', async () => {
      const result = await resolveUrlFromUrn('decentraland:off-chain:something:something-else')
      expect(result).toBeNull()
    })
  })

  describe('and the URN is an off-chain URN', () => {
    describe('and the registry is static-portable-experiences', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:off-chain:static-portable-experiences:quest-1'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the static-pe mappings URL for the quest', () => {
        expect(result).toEqual('https://static-pe.decentraland.io/quest-1/mappings')
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the registry is unity-renderer-cdn', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:off-chain:unity-renderer-cdn:0.0.0-123123123-badaeafa'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the decentraland CDN URL for the unity-renderer package at that version', () => {
        expect(result).toEqual('https://cdn.decentraland.org/@dcl/unity-renderer/0.0.0-123123123-badaeafa')
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the registry is kernel-cdn', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:off-chain:kernel-cdn:0.0.0-123123123-badaeafa'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the decentraland CDN URL for the kernel package at that version', () => {
        expect(result).toEqual('https://cdn.decentraland.org/@dcl/kernel/0.0.0-123123123-badaeafa')
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the registry is dcl-cdn', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:off-chain:dcl-cdn:@dcl/kernel/0.0.0-123123123-badaeafa'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the decentraland CDN URL for the given scoped path', () => {
        expect(result).toEqual('https://cdn.decentraland.org/@dcl/kernel/0.0.0-123123123-badaeafa')
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the registry is explorer-website-cdn', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:off-chain:explorer-website-cdn:0.0.0-123123123-badaeafa'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the decentraland CDN URL for the explorer-website package at that version', () => {
        expect(result).toEqual('https://cdn.decentraland.org/@dcl/explorer-website/0.0.0-123123123-badaeafa')
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the registry is base-avatars', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:off-chain:base-avatars:eyes_03'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the base-avatars wearable URL on the wearable-api', () => {
        expect(result).toEqual('https://wearable-api.decentraland.org/v2/collections/base-avatars/wearables/eyes_03')
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })
  })

  describe('and the URN is an entity URN', () => {
    describe('and it includes a baseUrl query parameter', () => {
      it('should resolve to baseUrl joined with the CID', async () => {
        const result = await resolveUrlFromUrn(
          'urn:decentraland:entity:bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki?baseUrl=https://ipfs.com/ipfs'
        )
        expect(result).toEqual('https://ipfs.com/ipfs/bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki')
      })
    })

    describe('and it includes an empty-named pair before baseUrl (ADR-207: dcl variant)', () => {
      it('should still resolve to baseUrl joined with the CID', async () => {
        const result = await resolveUrlFromUrn(
          'urn:decentraland:entity:bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki?=dcl&baseUrl=https://ipfs.com/ipfs'
        )
        expect(result).toEqual('https://ipfs.com/ipfs/bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki')
      })
    })

    describe('and it includes an empty-named pair before baseUrl (ADR-207: empty variant)', () => {
      it('should still resolve to baseUrl joined with the CID', async () => {
        const result = await resolveUrlFromUrn(
          'urn:decentraland:entity:bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki?=&baseUrl=https://ipfs.com/ipfs'
        )
        expect(result).toEqual('https://ipfs.com/ipfs/bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki')
      })
    })

    describe('and the baseUrl has a trailing slash', () => {
      it('should resolve without a double slash between baseUrl and CID', async () => {
        const result = await resolveUrlFromUrn(
          'urn:decentraland:entity:bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki?baseUrl=https://ipfs.com/ipfs/'
        )
        expect(result).toEqual('https://ipfs.com/ipfs/bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki')
      })
    })

    describe('and no baseUrl is supplied', () => {
      it('should default to the peer.decentraland.org content URL', async () => {
        const result = await resolveUrlFromUrn(
          'urn:decentraland:entity:bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki'
        )
        expect(result).toEqual(
          'https://peer.decentraland.org/content/contents/bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki'
        )
      })
    })

    describe('and the baseUrl uses the javascript: scheme', () => {
      it('should return null instead of emitting the attacker-controlled URL', async () => {
        const result = await resolveUrlFromUrn(
          'urn:decentraland:entity:bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki?baseUrl=javascript:alert(1)//'
        )
        expect(result).toBeNull()
      })
    })

    describe('and the baseUrl is not a well-formed URL', () => {
      it('should return null instead of honoring the invalid baseUrl', async () => {
        const result = await resolveUrlFromUrn(
          'urn:decentraland:entity:bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki?baseUrl=not a url'
        )
        expect(result).toBeNull()
      })
    })

    describe('and the cid contains a percent-encoded path traversal', () => {
      it('should return null instead of escaping the content path', async () => {
        const result = await resolveUrlFromUrn('urn:decentraland:entity:..%2f..%2fetc%2fpasswd')
        expect(result).toBeNull()
      })
    })

    describe('and the baseUrl points to an arbitrary well-formed https host', () => {
      // baseUrl is a user-controlled feature (see the ipfs.com cases above); the fix only
      // rejects non-http(s) schemes and malformed URLs, so any well-formed https URL is still
      // honored by design. Blocking specific hosts would require an allowlist not in scope and
      // would break the legitimate https://ipfs.com/ipfs cases.
      it('should resolve to that baseUrl joined with the CID', async () => {
        const result = await resolveUrlFromUrn(
          'urn:decentraland:entity:bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki?baseUrl=https://evil.example.com/steal'
        )
        expect(result).toEqual(
          'https://evil.example.com/steal/bafkreickvfk6aungjshpuuwyhkopd4hlzsyqewhx4jru3gpp46whek7dki'
        )
      })
    })
  })

  describe('and the URN is a LAND URN', () => {
    describe('and the network is ethereum with a decimal token id', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:LAND:4763953136893138488487244504044754960247'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the scene entity URL on the mainnet peer', () => {
        expect(result).toEqual('https://peer.decentraland.org/content/entities/scene?pointer=13,-137')
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the network is sepolia with a decimal token id', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:sepolia:LAND:4763953136893138488487244504044754960247'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the scene entity URL on the sepolia peer', () => {
        expect(result).toEqual('https://peer.decentraland.zone/content/entities/scene?pointer=13,-137')
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the network is sepolia with coordinates', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:sepolia:LAND:-10,-13'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the scene entity URL on the sepolia peer', () => {
        expect(result).toEqual('https://peer.decentraland.zone/content/entities/scene?pointer=-10,-13')
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })
  })

  describe('and the URN is a collections-v1 asset', () => {
    describe('and referenced by collection name', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:collections-v1:community_contest:cw_bell_attendant_hat'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the wearable-api URL for that collection and wearable', () => {
        expect(result).toEqual(
          'https://wearable-api.decentraland.org/v2/collections/community_contest/wearables/cw_bell_attendant_hat'
        )
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the collection name is base-avatars (not valid for collections-v1)', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:collections-v1:base-avatars:eyes_03'
        result = await resolveUrlFromUrn(urn)
      })

      it('should return null', () => {
        expect(result).toBeNull()
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and referenced by contract address matching a known collection', () => {
      beforeEach(async () => {
        urn =
          'urn:decentraland:ethereum:collections-v1:0x32b7495895264ac9d0b12d32afd435453458b1c6:cw_bell_attendant_hat'
        result = await resolveUrlFromUrn(urn)
      })

      it('should resolve to the wearable-api URL using the back-filled collection name', () => {
        expect(result).toEqual(
          'https://wearable-api.decentraland.org/v2/collections/community_contest/wearables/cw_bell_attendant_hat'
        )
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })
  })

  describe('and the URN is a legacy dcl:// URL', () => {
    describe('and it points to a base-avatars wearable', () => {
      it('should resolve to the wearable-api URL on the base-avatars collection', async () => {
        const result = await resolveUrlFromUrn('dcl://base-avatars/eyes_03')
        expect(result).toEqual('https://wearable-api.decentraland.org/v2/collections/base-avatars/wearables/eyes_03')
      })
    })

    describe('and it points to a collections-v1 wearable', () => {
      it('should resolve to the wearable-api URL on the halloween_2019 collection', async () => {
        const result = await resolveUrlFromUrn('dcl://halloween_2019/bride_of_frankie_earring')
        expect(result).toEqual(
          'https://wearable-api.decentraland.org/v2/collections/halloween_2019/wearables/bride_of_frankie_earring'
        )
      })
    })
  })

  describe('and resolver options override the content server host', () => {
    let options: ResolversOptions

    beforeEach(async () => {
      urn = 'urn:decentraland:sepolia:LAND:4763953136893138488487244504044754960247'
      options = { contentServerHost: 'localhost:7666' }
      result = await resolveUrlFromUrn(urn, options)
    })

    it('should resolve using the overridden host instead of the default peer', () => {
      expect(result).toEqual('https://localhost:7666/content/entities/scene?pointer=13,-137')
    })

    it('should produce a URN that is valid per RFC2141', () => {
      expect(RFC2141.parse(urn)).toBeTruthy()
    })
  })
})
