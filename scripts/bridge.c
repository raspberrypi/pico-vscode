#include <errno.h>
#include <malloc.h>

/**
 * @brief Allocates aligned memory in accordance with POSIX standards.
 * 
 * The `posix_memalign` function allocates a block of memory with the specified alignment 
 * and size. The allocated memory is stored in the location pointed to by `memptr`. The 
 * alignment must be a power of two and a multiple of `sizeof(void *)`. This function is 
 * typically used for ensuring memory alignment for hardware or performance requirements.
 * 
 * @param[out] memptr A pointer to the memory location where the aligned memory will be stored. 
 *                    This parameter must not be NULL.
 * @param[in] alignment The alignment boundary in bytes. Must be a power of two and a multiple 
 *                      of `sizeof(void *)`.
 * @param[in] size The size of the memory block to allocate in bytes.
 * 
 * @return int Returns 0 on success. On failure, returns:
 *         - `EINVAL` if the alignment is invalid (not a power of two or not a multiple of `sizeof(void *)`).
 *         - `ENOMEM` if memory allocation fails.
 * 
 * @note The caller is responsible for freeing the allocated memory using `free()` when it is no longer needed.
 */
int posix_memalign(void **memptr, size_t alignment, size_t size) {
    // Validate alignment requirements
    if ((alignment % sizeof(void *) != 0) || (alignment & (alignment - 1)) != 0) {
        return EINVAL; // Invalid alignment
    }

    // Use memalign to allocate memory
    void *ptr = memalign(alignment, size);
    if (ptr == NULL) {
        return ENOMEM; // Memory allocation failure
    }

    *memptr = ptr; // Set the memory pointer
    return 0;      // Success
}
